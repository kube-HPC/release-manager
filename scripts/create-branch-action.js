const fs = require('fs');
const path = require('path');
const syncSpawn = require('spawn-sync');
const simpleGit = require('simple-git');

const baseFolder = path.resolve(path.join(process.env.HOME, 'dev', 'hkube'));

const coreRepos = [
    'algorithm-builder',
    'algorithm-operator',
    'algorithm-queue',
    'api-server',
    'caching-service',
    'datasources-service',
    'pipeline-driver',
    'pipeline-driver-queue',
    'resource-manager',
    'task-executor',
    'trigger-service',
    'worker',
];

const main = async () => {
    const versions = JSON.parse(fs.readFileSync('./version.json'));
    const hkubeRepo = {
        project: 'hkube',
        tag: versions.systemVersion
    }
    const helmRepo = {
        project: 'helm',
        tag: 'v2.0.262'
    }
    // versions.versions = [...versions.versions, hkubeRepo];
    const repoVersions = versions.versions.filter(v=>!coreRepos.includes(v.project)).concat(hkubeRepo,helmRepo)
    const branchName = 'release_v2.0'
    for (let v of repoVersions) {
        try {
            console.log(`${v.project}: ${v.tag}`);
            const repoFolder = path.join(baseFolder, v.project);
            const git = simpleGit({baseDir: repoFolder})
            // await syncSpawn('grep', ['-Po', '\\"version\\": \\"\\K(.*)(?=\\",)', 'package.json'], { cwd: repoFolder ,stdio: 'inherit'})


            // await syncSpawn('git', ['status'], { cwd: repoFolder, stdio: 'inherit' })
            // const status = await git.status();
            const a = await git.branch('-r')
            const master = a.branches.master? 'master' : 'main';
            // // await git.checkout(`${master}`)
            // await git.fetch()
            // await git.checkout(`${v.tag}`)
            // await syncSpawn('git', ['status'], { cwd: repoFolder, stdio: 'inherit' })
            // await syncSpawn('git',['checkout','-b',branchName],{cwd: repoFolder,stdio: 'inherit' })

            // await git.checkout(branchName)
            // await syncSpawn('git',['push','--set-upstream','origin',branchName],{cwd: repoFolder,stdio: 'inherit' })
            
            await git.checkout(`${master}`)
            // await syncSpawn('git',['checkout','master'],{cwd: repoFolder,stdio: 'inherit' })

            await syncSpawn('npm',['version','minor'],{cwd: repoFolder,stdio: 'inherit' })
            await syncSpawn('git',['push','--follow-tags'],{cwd: repoFolder,stdio: 'inherit' })


            // await syncSpawn('git',[`status`],{cwd: repoFolder,stdio: 'inherit' })


        }
        catch (e) {
            console.error(e)
        }
    }
}

main()