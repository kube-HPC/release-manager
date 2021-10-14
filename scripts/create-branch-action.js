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
const orgUrl = 'github.com/kube-HPC'
const coreRepos = [
    'algorithm-builder',
    'algorithm-debug',
    'algorithm-gateway',
    'algorithm-operator',
    'algorithm-queue',
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
    const repoVersions = versions.versions.filter(v => !coreRepos.includes(v.project)).concat(hkubeRepo, helmRepo)
    const branchName = RELEASE_BRANCH
    console.log(`Cloning all repos for version ${SYSTEM_VERSION}`)
    const errors=[];
    for (let v of repoVersions) {
        try {
            console.log(`${v.project}: ${v.tag}`);
            const repoFolder = path.join(BASE_FOLDER, v.project);
            let git = simpleGit({ baseDir: BASE_FOLDER })
            await git.clone(`https://${GH_TOKEN}@${orgUrl}/${v.project}`)
            git = simpleGit({ baseDir: repoFolder });
            await git.checkout(`${v.tag}`);
            const packageJson = JSON.parse(fs.readFileSync(path.join(repoFolder, './package.json')));
            console.log(`cloned ${v.project} in tag ${packageJson.version}`);
            // await syncSpawn('grep', ['-Po', '\\"version\\": \\"\\K(.*)(?=\\",)', 'package.json'], { cwd: repoFolder ,stdio: 'inherit'})


            // await syncSpawn('git', ['status'], { cwd: repoFolder, stdio: 'inherit' })
            // const status = await git.status();
            // const a = await git.branch('-r')
            // const master = a.branches.master ? 'master' : 'main';
            // // await git.checkout(`${ master }`)
            // await git.fetch()
            // await git.checkout(`${ v.tag }`)
            // await syncSpawn('git', ['status'], { cwd: repoFolder, stdio: 'inherit' })
            // await syncSpawn('git',['checkout','-b',branchName],{cwd: repoFolder,stdio: 'inherit' })

            // await git.checkout(branchName)
            // await syncSpawn('git',['push','--set-upstream','origin',branchName],{cwd: repoFolder,stdio: 'inherit' })

            // await git.checkout(`${ master }`)
            // // await syncSpawn('git',['checkout','master'],{cwd: repoFolder,stdio: 'inherit' })

            // await syncSpawn('npm', ['version', 'minor'], { cwd: repoFolder, stdio: 'inherit' })
            // await syncSpawn('git', ['push', '--follow-tags'], { cwd: repoFolder, stdio: 'inherit' })


            // await syncSpawn('git',[`status`],{cwd: repoFolder,stdio: 'inherit' })


        }
        catch (e) {
            console.error(e)
            errors.push({
                repo: v.project,
                error: e
            })
        }

        if (errors.length) {
            console.error(`got errors in ${errors.length} repositories`);
            exit(-1)
        }
    }
}

main()