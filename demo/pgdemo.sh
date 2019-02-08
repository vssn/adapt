DEMO_NAME=pgdemo
DEMO_DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

. "${DEMO_DIR}/minikube.sh"
. "${DEMO_DIR}/commands.sh"

cp -R "/src/cli/test_projects/${DEMO_NAME}" /tmp
cd "/tmp/${DEMO_NAME}"

minikubeConnect || \
    { error Error connecting to minikube; return 1; }

cat ~/.kube/config | toJson > ./kubeconfig.json || \
    { error Error getting kubeconfig; return 1; }

export DOCKER_HOST=$(minikubeDockerHost)

echo
echo adapt deploy:create --init laptop
echo adapt deploy:create --init k8s

