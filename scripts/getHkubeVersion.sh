#!/bin/bash
hash helm &> /dev/null
if [ $? -ne 0 ]
then
  echo "helm v3 is required and could not be found"
  exit
fi
helm_version=$(helm version)
echo $helm_version | grep -q 'Version:"v3'
has_helm3=$?
if [ $has_helm3 -ne 0 ]
then
  echo "helm v3 is required and could not be found"
  echo "found helm version: ${helm_version} "
  exit
fi
BASE_DIR=${BASE_DIR:-$HOME/install/dockers}
if [ -z $DEV_VERSION ]; then
  HKUBE_CHART_REPO="hkube/hkube"
  helm repo add hkube https://hkube.io/helm
else
  HKUBE_CHART_REPO="hkube-dev/hkube"
  helm repo add hkube-dev https://hkube.io/helm/dev
fi
helm repo update
CHART_INFO=$(helm search repo hkube|grep "${HKUBE_CHART_REPO}")
LATEST_VERSION=$( echo $CHART_INFO | awk '{print $2}')
APP_VERSION=$( echo $CHART_INFO | awk '{print $3}')
if [ ! -z $VERSION ]; then
  CHART_INFO=$(helm search repo ${HKUBE_CHART_REPO} --version $VERSION | grep $VERSION)
  APP_VERSION=$( echo $CHART_INFO | awk '{print $3}')
fi
VERSION=${VERSION:-$LATEST_VERSION}
echo downloading version $VERSION, app_version: $APP_VERSION

DIR=${BASE_DIR}/hkube-${VERSION}
mkdir -p ${DIR}
cd ${DIR}
mkdir -p chart
helm pull ${HKUBE_CHART_REPO} --version ${VERSION} -d chart
tar xfv ./chart/hkube-${VERSION}.tgz
mkdir -p dockers
curl -Lo image-export-import https://github.com/kube-HPC/image-exprort-import/releases/latest/download/image-export-import && chmod +x image-export-import
curl -Lo hkubectl https://github.com/kube-HPC/hkubectl/releases/latest/download/hkubectl-linux && chmod +x hkubectl
curl -Lo hkubectl.exe https://github.com/kube-HPC/hkubectl/releases/latest/download/hkubectl-win.exe
curl -Lo hkubectl-macos https://github.com/kube-HPC/hkubectl/releases/latest/download/hkubectl-macos
if [ ! -z $PREV_VERSION ]
then
  helm pull --untar ${HKUBE_CHART_REPO} --untardir hkube-${PREV_VERSION} --version ${PREV_VERSION}
  ./image-export-import export --path $PWD --semver ./hkube/values.yaml --prevVersion  ./hkube-${PREV_VERSION}/hkube/values.yaml
  ./image-export-import exportThirdparty --path $PWD --chartPath ./hkube/ --prevChartPath ./hkube-${PREV_VERSION}/hkube/ --options "global.sidecars.fluent_bit.enable=true,jaeger.enable=true,nginx-ingress.enable=true,minio.enable=true,global.image_pull_secret.use_existing=false,global.clusterName=download,global.k8senv=kubernetes"
  rm -rf hkube-${PREV_VERSION}
else
  ./image-export-import export --path $PWD --semver ./hkube/values.yaml
  ./image-export-import exportThirdparty --path $PWD --chartPath ./hkube/ --options "global.sidecars.fluent_bit.enable=true,jaeger.enable=true,nginx-ingress.enable=true,minio.enable=true,global.image_pull_secret.use_existing=false,global.clusterName=download,global.k8senv=kubernetes"
fi

sleep 5
mv ${APP_VERSION} dockers/hkube
mv thirdparty dockers/
if [ ! -z $COMPRESS ]; then
    echo compressing 
    tar cfz hkube-${VERSION}.tgz hkube dockers image-export-import hkubectl*
    echo ${VERSION} is ready at $(realpath hkube-${VERSION}.tgz)
    if [ ! -z $SPLIT ]; then
        echo splitting hkube-${VERSION}.tgz...
        pushd . >/dev/null
        mkdir -p splits
        cd splits
        split -b 100M ../hkube-${VERSION}.tgz hkube-${VERSION}-
        echo splits are ready at $(realpath .)
        popd >/dev/null
    fi
fi

