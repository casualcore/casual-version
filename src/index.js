import * as core from '@actions/core';
import { execSync } from 'child_process';

import * as github from '@actions/github';

function getBranchName() 
{
  // context.ref innehåller oftast 'refs/heads/branch-name'
  // context.payload.pull_request.head.ref innehåller käll-branchen vid PR
  
  const pullRequest = github.context.payload.pull_request;
  if (pullRequest) {
    return pullRequest.head.ref;
  }

  if (github.context.ref)
    // För push-events, ta bort 'refs/heads/' från strängen
    return github.context.ref.replace('refs/heads/', '');
  else
    return undefined;
}

function getTags(major, minor)
{
  const prefix = `${major}.${minor}.`;

  // Retrieve tags from repo
  const tags = execSync(`git tag -l "${prefix}*"`).toString();
  return tags;
}

function getCurrentPatch(tags)
{
  const parsedTags = tags.split('\n')
    .map(t => t.trim())
    .filter(t => t.length > 0)
    .filter(t => t.match(/(\d+)\.(\d+)\.(\d+)$/));

  let currentPatch = undefined;

  if (parsedTags.length > 0) {
    // Find max current tag
    const patches = parsedTags.map(t => parseInt(t.split('.').pop(), 10));
    currentPatch = Math.max(...patches);
  }
  return currentPatch;
}

function getCurrentBeta(tags)
{
  const parsedTags = tags.split('\n')
    .map(t => t.trim())
    .filter(t => t.length > 0)
    .filter(t => t.match(/beta\.(\d+)$/));

  let currentBeta = undefined;

  if (parsedTags.length > 0) {
    // Find max current tag
    const beta = parsedTags.map(t => parseInt(t.split('.').pop(), 10));
    currentBeta = Math.max(...beta);
  }
  return currentBeta;
}

function normalized_branch( branch)
{
  return branch.replace(/feature\/[0-9.]+\//, '').replace(/-/g, '_').replace(/\//g, '_');
}

try {

  const release_type = core.getInput("release-type") || 'beta';
  const branch = getBranchName() || 'refs/heads/feature/1.9/handle-wild-cards-for-accept-header';

  if (core.isDebug())
    core.debug(`Branch: ${branch}`);

  if (!branch) {
    core.setFailed(`Could not find branch name`);
    process.exit(1);
  }

  const versionMatch = branch.match(/(\d+)\.(\d+)/);
  if (!versionMatch) {
    core.setFailed(`Unsupported branch name: ${branch}`);
    process.exit(1);
  }

  const major = versionMatch[1];
  const minor = versionMatch[2];
  const tags = getTags(major,minor);
  
  if (core.isDebug())
    core.debug(tags);

  const patch = getCurrentPatch(tags);
  const nextPatch = patch + 1 || 0;
  const nextVersion = `${major}.${minor}.${nextPatch}`;

  let build_version = "";
  let casual_version = "";
  let casual_release = "";

  if ( release_type == 'alpha')
  {
    const normalized = normalized_branch( branch);
    if (core.isDebug())
      core.debug(`normalized_branch: ${normalized}`);

    build_version = nextVersion + '-' + release_type + '.' + normalized + '.' + github.context.runNumber;
    casual_version = nextVersion;
    casual_release = release_type + '.' + normalized + '.' + github.context.runNumber;
  }
  else if( release_type == 'beta')
  {
    let beta = 1;
    const currentBeta = getCurrentBeta(tags);
    if( currentBeta)
      beta = currentBeta + 1;
    build_version = nextVersion + '-' + release_type + '.' + beta;
    casual_version = nextVersion;
    casual_release = release_type + '.' + beta;
  }
  else if ( release_type == 'release')
  {
    build_version = nextVersion;
    casual_version = nextVersion;
    casual_release = 1;
  }
  else
  {
    core.setFailed(`Unsupported release_type: ${release_type}. Supported are alpha, beta and release`);
    process.exit(1);
  }

  core.info(`Current patch for ${major}.${minor} was found. Next version is: ${build_version}`);
  core.setOutput("major-minor", `${major}.${minor}`);
  core.setOutput("build-version", build_version);
  core.setOutput("casual-version", casual_version);
  core.setOutput("casual-release", casual_release)

} catch (error) {
  core.setFailed(`Action failed: ${error.message}`);
}
