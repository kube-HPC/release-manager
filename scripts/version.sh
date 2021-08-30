#!/bin/bash
set -evo pipefail
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

export BRANCH=${BRANCH:-master}
echo cloning ${BRANCH} branch
git clone --single-branch --branch ${BRANCH} https://github.com/kube-HPC/hkube.git /tmp/hkube
cd /tmp/hkube
npm i
if [ -z $VERSION ]
then
  echo No Version. Defaulting to latest
  export VERSION=$(git describe --abbrev=0 --tags)  
fi
echo using version ${VERSION}
VERSION2="${VERSION#[vV]}"
VERSION_MAJOR="${VERSION2%%\.*}"
VERSION_MINOR="${VERSION2#*.}"
VERSION_MINOR="${VERSION_MINOR%.*}"
VERSION_PATCH="${VERSION2##*.}"
export REQUIRED_VERSION=v${VERSION_MAJOR}.$VERSION_MINOR
echo REQUIRED_VERSION=$REQUIRED_VERSION
HKUBE_FOLDER=/tmp/hkube ${DIR}/getVersions.js
