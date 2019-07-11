#!/bin/bash
set -ev
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

if ([ "$TRAVIS_BRANCH" == "master" ] || [ ! -z "$TRAVIS_TAG" ]) && [ "$TRAVIS_PULL_REQUEST" == "false" ]; then
  git config --global user.email "travis@hkube.io"
  git config --global user.name "Travis CI"
  export BRANCH=${VERSION:-master}
  echo cloning ${BRANCH} branch
  git clone --single-branch --branch ${BRANCH} https://github.com/kube-HPC/hkube.git ~/hkube
  cd ~/hkube
  npm i
  if [ -z $VERSION ]
  then
    echo No Version. Defaulting to latest
    export VERSION=$(git describe --abbrev=0 --tags)  
  fi
  echo using version ${VERSION}
  HKUBE_FOLDER=/home/travis/hkube ${DIR}/getVersions.js
else
  echo "version skiped!"
fi