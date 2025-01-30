const fs = require('fs');
const path = require('path');
const syncSpawn = require('spawn-sync');
const simpleGit = require('simple-git');

// Load environment variables
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

// Define core repositories, deprecated and special mappings)
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
    'worker'
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
    // Validate environment variables (Related - release_branch.yaml workflow)
    if (!VERSION) { // helm version to freeze in branch (e.g. v2.1.171)
        console.error('missing env variable VERSION');
        process.exit(-1);
    }
    if (!GH_TOKEN) { // Github token for authentication
        console.error('missing env variable GH_TOKEN');
        process.exit(-1);
    }
    if (!SYSTEM_VERSION) { // SYSTEM_VERSION=$(yq e '.fullSystemVersion' /tmp/hkube-$VERSION/hkube/values.yaml)
        console.error('missing env variable SYSTEM_VERSION');
        process.exit(-1);
    }
    if (!RELEASE_BRANCH) { // branch name to create (e.g. release_v2.1)
        console.error('missing env variable RELEASE_BRANCH');
        process.exit(-1);
    }
    if (!BASE_FOLDER) { // '/tmp/source'
        console.error('missing env variable BASE_FOLDER');
        process.exit(-1);
    }
    if (!VERSION_TYPE) { // version to increment (minor, major)
        console.error('missing env variable VERSION_TYPE');
        process.exit(-1);
    }

    // Read and validate version information from version.json
    const versions = JSON.parse(fs.readFileSync('./version.json'));
    if (versions.fullSystemVersion !== SYSTEM_VERSION) {
        console.error(`mismatched versions. From helm: ${SYSTEM_VERSION}, from release: ${VERSION}`);
        process.exit(-1);
    }

    // Prepare repository version list (excluding deprecated repos)
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
    const messages = [];
    // Clone repositories and checkout the correct version
    for (let v of repoVersions) {
        try {
            if (repoNameToPath[v.project]) {
                messages.push(`name ${v.project} converted to path => ${repoNameToPath[v.project]}`);
                v.project = repoNameToPath[v.project];
            }
            console.log(`${v.project}: ${v.tag}`);

            const repoFolder = path.join(BASE_FOLDER, v.project);
            let git = simpleGit({ baseDir: BASE_FOLDER });
            await git.clone(`https://${GH_TOKEN}@${orgUrl}/${v.project}`);
            git = simpleGit({ baseDir: repoFolder });

            await git.checkout(`${v.tag}`);
            const packageJson = JSON.parse(fs.readFileSync(path.join(repoFolder, './package.json')));
            console.log(`Cloned ${v.project} in tag ${packageJson.version}`);
        }
        catch (e) {
            console.error(e);
            errors.push({
                repo: v.project,
                error: e
            });
        }
    }
    // Exit if any error occurred
    if (errors.length) {
        console.error(`got errors in ${errors.length} repositories`);
        process.exit(-1);
    }

    console.log('\nConversions done:');
    messages.forEach(message => console.log(`- ${message}`));

    console.log(`Successfully cloned all repositories`);
    console.log('\n------------------------------------------------------------------------\n');
    errors = [];

    console.log(`Creating a new release branch for each repository\n`);

    // Create a new release branch for each repository
    for (let v of repoVersions) {
        try {
            console.log(`${v.project}: ${v.tag}`);
            const repoFolder = path.join(BASE_FOLDER, v.project);
            const git = simpleGit({ baseDir: repoFolder });

            const packageJson = JSON.parse(fs.readFileSync(path.join(repoFolder, './package.json')));
            console.log(`creating branch ${branchName} in ${v.project} from tag ${packageJson.version}`);

            const defaultBranch = await getDefaultBranch(git);
            console.log(`default branch name is ${defaultBranch}`);

            await git.checkoutLocalBranch(branchName);
            await git.push(['--set-upstream', 'origin', branchName]);
            await git.checkout(`${defaultBranch}`);
        }
        catch (e) {
            console.error(e);
            errors.push({
                repo: v.project,
                error: e
            })
        }
    }
    // Exit if any error occurred
    if (errors.length) {
        console.error(`got errors in ${errors.length} repositories`);
        process.exit(-1);
    }

    console.log(`\nSuccessfully created a new release branch for each repository`);
    console.log('\n------------------------------------------------------------------------\n');
    errors = [];

    console.log(`Version bumping and tagging process starting\n`);

    // Version bumpping and tagging process
    for (let v of repoVersions) {
        try {
            console.log(`${v.project}: ${v.tag}`);
            const repoFolder = path.join(BASE_FOLDER, v.project);
            const git = simpleGit({ baseDir: repoFolder });
            // const packageJson = JSON.parse(fs.readFileSync(path.join(repoFolder, './package.json')));

            const defaultBranch = await getDefaultBranch(git);
            console.log(`default branch name is ${defaultBranch}`);

            console.log(`bumping ${VERSION_TYPE} version ${v.project}`);
            await git.checkout(`${defaultBranch}`);

            if (v.project === 'hkube') {
                // Special handling for `hkube` repo (using `lerna` for monorepo versioning)
                await syncSpawn('lerna', [
                    'version',
                    VERSION_TYPE,
                    '--no-push',
                    '--yes',
                    '--includeMergedTags',
                    '--no-git-tag-version',
                    '--no-commit-hooks',
                    '--force-publish', '*'
                ], { cwd: repoFolder, stdio: 'inherit' });

                await git.add('core/*/package-lock.json');
                await git.add('core/*/package.json');
                await git.commit('update versions', ['--no-verify']);

                await syncSpawn('npm', ['version', VERSION_TYPE, '--git-tag-version', '--commit-hooks', 'false', '-m', 'build all now!!!'], { cwd: repoFolder, stdio: 'inherit' });
            }
            else {
                // Standard version bump for other repos
                await syncSpawn('npm', ['version', VERSION_TYPE, '--commit-hooks', 'false'], { cwd: repoFolder, stdio: 'inherit' });
            }
            await git.push(['--follow-tags']);
        }
        catch (e) {
            console.error(e);
            errors.push({
                repo: v.project,
                error: e
            })
        }
    }

    // If versioning errors occured, exit
    if (errors.length) {
        console.error(`got errors in ${errors.length} repositories`);
        process.exit(-1);
    }

    console.log(`Version bumping and tagging process completed successfully`);
}

main();