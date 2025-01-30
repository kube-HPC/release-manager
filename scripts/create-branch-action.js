const fs = require('fs');
const path = require('path');
const syncSpawn = require('spawn-sync');
const simpleGit = require('simple-git');
const { error } = require('console');

const VERSION = process.env.VERSION;
const SYSTEM_VERSION = process.env.SYSTEM_VERSION;
const RELEASE_BRANCH = process.env.RELEASE_BRANCH;
const GH_TOKEN = process.env.GH_TOKEN;
const BASE_FOLDER = process.env.BASE_FOLDER;
const VERSION_TYPE = process.env.VERSION_TYPE;
const orgUrl = 'github.com/kube-HPC';

/**
 * Gets the default branch name from the remote repository (origin).
 * It runs the `git remote show origin` command to fetch the default branch name.
 * 
 * @returns {Promise<string>} A promise that resolves with the default branch name (e.g., 'main' or 'develop').
 *                           If no default branch is found, it will resolve with 'main'.
 */
const getDefaultBranch = (git) => {
    return new Promise((resolve, reject) => {
        git.raw(['remote', 'show', 'origin'], (err, data) => {
        if (err) {
            reject('Error executing git command');
            return;
        }

        const match = data.match(/HEAD branch: (\S+)/);
        const defaultBranch = match ? match[1] : 'main';
        resolve(defaultBranch);
        });
    });
}

const coreRepos = [
    'algorithm-builder',
    'algorithm-debug',
    'algorithm-gateway',
    'algorithm-operator',
    'algorithm-queue',
    'algorithm-output',
    'algorithm-hyperparams-tuner',
    'api-server',
    'caching-service',
    'datasources-service',
    'gc-service',
    'openapi-spec',
    'pipeline-driver-queue',
    'pipeline-driver',
    'resource-manager',
    'task-executor',
    'trigger-service',
    'worker',
];

const deprecatedRepos = [
    'storage-cleaner',
    'pipeline-cleaner',
    'etcd-cleaner',
    'datasource-cleaner',
    'clean-old-jobs'

];

const repoNameToPath = {
    site: 'kube-HPC.github.io'
};

const main = async () => {
    if (!VERSION) {
        console.error('missing env variable VERSION')
        process.exit(-1);
    }
    if (!GH_TOKEN) {
        console.error('missing env variable GH_TOKEN')
        process.exit(-1);
    }
    if (!SYSTEM_VERSION) {
        console.error('missing env variable SYSTEM_VERSION')
        process.exit(-1);
    }
    if (!RELEASE_BRANCH) {
        console.error('missing env variable RELEASE_BRANCH')
        process.exit(-1);
    }
    if (!BASE_FOLDER) {
        console.error('missing env variable BASE_FOLDER')
        process.exit(-1);
    }
    if (!VERSION_TYPE) {
        console.error('missing env variable VERSION_TYPE')
        process.exit(-1);
    }
    const versions = JSON.parse(fs.readFileSync('./version.json'));
    if (versions.fullSystemVersion !== SYSTEM_VERSION) {
        console.error(`mismatched versions. From helm: ${SYSTEM_VERSION}, from release: ${VERSION}`)
        process.exit(-1);
    }
    const hkubeRepo = {
        project: 'hkube',
        tag: versions.systemVersion
    }
    const helmRepo = {
        project: 'helm',
        tag: VERSION
    }
    const repoVersions = versions.versions.filter(v => !coreRepos.includes(v.project))
        .filter(v => !deprecatedRepos.includes(v.project))
        .concat(hkubeRepo, helmRepo);

    const branchName = RELEASE_BRANCH;
    console.log(`Cloning all repos for version ${SYSTEM_VERSION}\n`);

    let errors = [];
    for (let v of repoVersions) {
        try {
            if (repoNameToPath[v.project]) {
                messages.push(`name ${v.project} converted to path => ${repoNameToPath[v.project]}`);
                v.project = repoNameToPath[v.project];
            }
            console.log(`${v.project}: ${v.tag}`);
            const repoFolder = path.join(BASE_FOLDER, v.project);
            let git = simpleGit({ baseDir: BASE_FOLDER })
            await git.clone(`https://${GH_TOKEN}@${orgUrl}/${v.project}`)
            git = simpleGit({ baseDir: repoFolder });
            await git.checkout(`${v.tag}`);
            const packageJson = JSON.parse(fs.readFileSync(path.join(repoFolder, './package.json')));
            console.log(`cloned ${v.project} in tag ${packageJson.version}`);
        }
        catch (e) {
            console.error(e)
            errors.push({
                repo: v.project,
                error: e
            })
        }
    }
    if (errors.length) {
        console.error(`got errors in ${errors.length} repositories`);
        process.exit(-1)
    }

    console.log('\nConversions done:');
    messages.forEach(message => console.log(`- ${message}`));

    console.log(`Successfully cloned all repositories`);
    console.log('\n------------------------------------------------------------------------\n');
    errors = [];

    console.log(`Creating a new release branch for each repository\n`);

    for (let v of repoVersions) {
        try {
            console.log(`${v.project}: ${v.tag}`);
            const repoFolder = path.join(BASE_FOLDER, v.project);
            const git = simpleGit({ baseDir: repoFolder });
            const packageJson = JSON.parse(fs.readFileSync(path.join(repoFolder, './package.json')));
            console.log(`creating branch ${branchName} in ${v.project} from tag ${packageJson.version}`);

            const defaultBranch = await getDefaultBranch(git);
            console.log(`default branch name is ${defaultBranch}`);

            await git.checkoutLocalBranch(branchName)
            await git.push(['--set-upstream', 'origin', branchName])
            await git.checkout(`${master}`)
        }
        catch (e) {
            console.error(e)
            errors.push({
                repo: v.project,
                error: e
            })
        }
    }
    if (errors.length) {
        console.error(`got errors in ${errors.length} repositories`);
        process.exit(-1)
    }

    console.log(`\nSuccessfully created a new release branch for each repository`);
    console.log('\n------------------------------------------------------------------------\n');
    errors = [];

    console.log(`Version bumping and tagging process starting\n`);

    for (let v of repoVersions) {
        try {
            console.log(`${v.project}: ${v.tag}`);
            const repoFolder = path.join(BASE_FOLDER, v.project);
            const git = simpleGit({ baseDir: repoFolder });
            const packageJson = JSON.parse(fs.readFileSync(path.join(repoFolder, './package.json')));

            const defaultBranch = await getDefaultBranch(git);
            console.log(`default branch name is ${defaultBranch}`);

            console.log(`bumping ${VERSION_TYPE} version ${v.project}`);
            await git.checkout(`${master}`)
            if (v.project === 'hkube') {
                await syncSpawn('lerna', [
                    'version',
                    VERSION_TYPE,
                    '--no-push',
                    '--yes',
                    '--includeMergedTags',
                    '--no-git-tag-version',
                    '--no-commit-hooks',
                    '--force-publish', '*'
                ], { cwd: repoFolder, stdio: 'inherit' })
                await git.add('core/*/package-lock.json');
                await git.add('core/*/package.json');
                await git.commit('update versions', ['--no-verify'])
                await syncSpawn('npm', ['version', VERSION_TYPE, '--git-tag-version', '--commit-hooks', 'false', '-m', 'build all now!!!'], { cwd: repoFolder, stdio: 'inherit' })
            }
            else {
                await syncSpawn('npm', ['version', VERSION_TYPE, '--commit-hooks', 'false'], { cwd: repoFolder, stdio: 'inherit' })
            }
            await git.push(['--follow-tags'])
        }
        catch (e) {
            console.error(e)
            errors.push({
                repo: v.project,
                error: e
            })
        }
    }
    if (errors.length) {
        console.error(`got errors in ${errors.length} repositories`);
        process.exit(-1)
    }

    console.log(`Version bumping and tagging process completed successfully`);
}

main()