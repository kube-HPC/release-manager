#!/usr/bin/env node
const Project = require("@lerna/project");
const Octokit = require('@octokit/rest')
const jsyaml = require('js-yaml')
const unionBy = require('lodash.unionby');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const packageVersion = process.env.VERSION;
const tagName = `${packageVersion}-${Date.now()}`

const requiredVersion = process.env.REQUIRED_VERSION || 'v2.1';
const HKUBE = 'Kube-HPC'
const HKUBE_REPO = 'hkube'
const CORE_TOPIC = 'hkube-core'
const RELEASE_MANAGER_REPO = 'release-manager'

const getCoreVersions = async () => {
    const cwd = process.env.HKUBE_FOLDER || process.cwd();
    const project = new Project(cwd);
    const pkgs = await project.getPackages();

    const versions = pkgs.map(node => ({
        project: node.name,
        tag: `v${node.version}`
    }));
    const output = {
        systemVersion: packageVersion,
        fullSystemVersion: tagName,
        versions: versions
    }
    return output;

};

const paginationHelper = (github, method, options) => {
    return github.paginate(method.endpoint.merge(options))
}

const getRepoPackageName = async (github,options) => {
    let jsonMetaData = {};
    let mergedOptions = {...options,path:"package.json"};
    const contents = await github.repos.getContents(mergedOptions);
    if (contents) {
        const packageJsonContent = Buffer.from(contents.data.content, 'base64').toString();
        try {
          const { name } = JSON.parse(packageJsonContent);
          jsonMetaData = {
            repoName: options.repo,
            name: name || ''
          };
        } catch (error) {
        console.error(`Error parsing package.json for repo ${options.repo}: ${error.message}`);
        }
    }
    return jsonMetaData;
}

const getRestVersions = async (github) => {
    const reposRaw = await paginationHelper(github, github.repos.listForOrg, {
        org: 'Kube-HPC'
    });
    const repos = reposRaw.map(r => {
        return {
            name: r.name,
            full_name: r.full_name,
            topics: r.topics
        }
    })
    const coreRepos = repos.filter(r => r.topics.includes(CORE_TOPIC));
    const getVersion = async (repo) => {
        const tags = await paginationHelper(github, github.repos.listTags, { owner: HKUBE, repo: repo.name })
        const tagNames = tags.map(t => ({
            name: t.name,
            sha: t.commit.sha
        })).filter(t => t.name.startsWith(requiredVersion));
        const sorted = tagNames.sort((a, b) => {
            const aToCompare = parseFloat(a.name.replace(requiredVersion + '.', ''));
            const bToCompare = parseFloat(b.name.replace(requiredVersion + '.', ''));
            return bToCompare - aToCompare;
        })
        //get package.json contents and use "name" field if it exists, instead of repository name.
        const jsonMetaData = await getRepoPackageName(github, { owner: HKUBE, repo: repo.name });
        const versionTag = tagNames[0];
        if (!versionTag) {
            console.error(`project ${repo.name} has no tags of version ${requiredVersion}`)
            return ({ project: repo.name, tag: 'none' });
        }
        let nameToReturn = repo.name;
        if (jsonMetaData.name.length > 0){ //package.json "name" field should be the same as hkube/<nameFieldHere> in image name
            nameToReturn = jsonMetaData.name;
        }
        return ({ project: nameToReturn, tag: versionTag.name, sha: versionTag.sha });
    }

    const coreReposTagPromises = coreRepos.map(getVersion);
    const versions = await Promise.all(coreReposTagPromises);
    const versionsFiltered = versions.filter(v => v.tag !== 'none');
    return versionsFiltered;
}

const uploadFile = async (github,release,file,label)=>{
    const content = await readFile(file);
    const uploadRes = await github.repos.uploadReleaseAsset({
        url: release.data.upload_url,
        headers:{
            'content-type':'application/json',
            'content-length':content.byteLength
        },
        file: content,
        name: path.basename(file),
        label
    })
};

const createRelease = async (github) => {
    const masterRef = await github.git.getRef({
        owner: HKUBE,
        repo: RELEASE_MANAGER_REPO,
        ref: 'heads/master'
    });
    if (masterRef.data && masterRef.data.object) {
        const tagResponse = await github.git.createTag({
            owner: HKUBE,
            repo: RELEASE_MANAGER_REPO,
            tag: tagName,
            message: 'version ' + packageVersion,
            object: masterRef.data.object.sha,
            type: 'commit',
            tagger: {
                name: 'Travis CI',
                email: 'travis@hkube.io',
                date: new Date()
            }
        })
        const tagRefResponse = await github.repos.createRelease({
            owner: HKUBE,
            repo: RELEASE_MANAGER_REPO,
            tag_name: tagName,
            name: tagName,
        })
        await uploadFile(github,tagRefResponse,'./version.json','Version Description')
        await uploadFile(github,tagRefResponse,'./version.yaml','Version Description yaml')
        
    }
}

const main = async () => {
    try {
        const github = new Octokit({
            // debug: true,
            previews: [
                'mercy-preview'
            ],
            auth: process.env.GH_TOKEN || undefined
        })
        const core = await getCoreVersions();
        const other = await getRestVersions(github);

        const allVersions = {
            systemVersion: core.systemVersion,
            fullSystemVersion: core.fullSystemVersion,
            versions: unionBy(core.versions, other, 'project')
        }
        await writeFile('version.json', JSON.stringify(allVersions, null, 2));
        const yamlVersions = jsyaml.safeDump(allVersions.versions.reduce((acc, cur, i) => {
            const key = cur.project; // add this to change - to _ .replace(/-/g,'_')
            acc[key] = {
                image: {
                    tag: cur.tag
                }
            };
            return acc;
        }, {
                systemversion: core.systemVersion,
                fullSystemVersion: core.fullSystemVersion
            }));
        await writeFile('version.yaml', yamlVersions);

        await createRelease(github);
    } catch (error) {
        console.error('Error:', error)
        process.exit(1);
    }
}
main();
