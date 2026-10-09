pipeline {
    agent any

    options {
        disableConcurrentBuilds()
        timestamps()
    }

    parameters {
        string(
            name: 'FAIRWAY_HOST_PORT',
            defaultValue: '3000',
            description: 'Host port used by the Fairway Live container.'
        )
    }

    environment {
        IMAGE_NAME = 'fairway-live'
        REGISTRY = '192.168.1.13:5000'
        IMAGE_PLATFORM = 'linux/arm64'
        PI_HOST = '192.168.1.14'
        PI_DEPLOY_DIR = '/home/hosting/fairway-live'
        PI_CREDENTIALS_ID = 'raspberry-pi-ssh'
        JENKINS_CONTAINER = 'Jenkins'
    }

    stages {
        stage('Build and verify') {
            steps {
                sh '''
                    docker run --rm \\
                        --volumes-from ${JENKINS_CONTAINER} \\
                        --workdir /var/jenkins_home/workspace/${JOB_NAME} \\
                        node:22-alpine \\
                        sh -c 'npm ci && npm run lint && npm run typecheck && npm test'
                '''
            }
        }

        stage('Build and publish Docker image') {
            steps {
                sh '''
                    set -eu
                    docker buildx build \
                        --platform "${IMAGE_PLATFORM}" \
                        --tag "${REGISTRY}/${IMAGE_NAME}:${BUILD_NUMBER}" \
                        --tag "${REGISTRY}/${IMAGE_NAME}:latest" \
                        --push \
                        .
                '''
            }
        }

        stage('Approve deployment') {
            steps {
                input message: 'Deploy the verified Fairway Live image to the home server?', ok: 'Deploy'
            }
        }

        stage('Deploy') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: "${PI_CREDENTIALS_ID}",
                        usernameVariable: 'PI_USER',
                        passwordVariable: 'PI_PASSWORD'
                    )
                ]) {
                    sh '''
                        docker run --rm -i \\
                            --volume /var/run/docker.sock:/var/run/docker.sock \\
                            --volumes-from ${JENKINS_CONTAINER} \\
                            --workdir /var/jenkins_home/workspace/${JOB_NAME} \\
                            --env PI_HOST \\
                            --env PI_DEPLOY_DIR \\
                            --env PI_USER \\
                            --env PI_PASSWORD \\
                            --env IMAGE_NAME \\
                            --env BUILD_NUMBER \\
                            --env FAIRWAY_HOST_PORT \\
                            docker:27-cli sh -s <<'REMOTE_DEPLOY'
                        set -eu
                        apk add --no-cache gzip openssh-client sshpass

                        SSH_DIR="/tmp/ssh"
                        mkdir -p "${SSH_DIR}"
                        chmod 700 "${SSH_DIR}"
                        touch "${SSH_DIR}/known_hosts"
                        chmod 600 "${SSH_DIR}/known_hosts"
                        ssh-keyscan -H "${PI_HOST}" >> "${SSH_DIR}/known_hosts" 2>/dev/null
                        SSH_OPTS="-o UserKnownHostsFile=${SSH_DIR}/known_hosts -o StrictHostKeyChecking=yes -o ConnectTimeout=15 -o ServerAliveInterval=5 -o ServerAliveCountMax=3"
                        export SSHPASS="${PI_PASSWORD}"

                        sshpass -e ssh ${SSH_OPTS} "${PI_USER}@${PI_HOST}" \\
                            "mkdir -p '${PI_DEPLOY_DIR}'"

                        sshpass -e scp ${SSH_OPTS} docker-compose.yml \\
                            "${PI_USER}@${PI_HOST}:${PI_DEPLOY_DIR}/docker-compose.yml"

                        sshpass -e ssh ${SSH_OPTS} "${PI_USER}@${PI_HOST}" \\
                            "test -f '${PI_DEPLOY_DIR}/.env' || { echo 'Missing ${PI_DEPLOY_DIR}/.env on the Pi.'; exit 1; }"

                        tar --exclude=.git --exclude=node_modules --exclude=.next --exclude=.env -czf - . | \\
                            sshpass -e ssh ${SSH_OPTS} "${PI_USER}@${PI_HOST}" \\
                            "tar -xzf - -C '${PI_DEPLOY_DIR}'"

                        sshpass -e ssh ${SSH_OPTS} "${PI_USER}@${PI_HOST}" \\
                            "cd '${PI_DEPLOY_DIR}' && docker compose -p fairway-live up -d --build app"

                        sleep 5
                        if ! sshpass -e ssh ${SSH_OPTS} "${PI_USER}@${PI_HOST}" \\
                            docker ps --filter name=fairway-live-app --filter status=running --quiet | grep -q .; then
                            sshpass -e ssh ${SSH_OPTS} "${PI_USER}@${PI_HOST}" \\
                                "docker logs fairway-live-app 2>&1 || true"
                            echo "Fairway Live container is not running."
                            exit 1
                        fi
REMOTE_DEPLOY
                    '''
                }
            }
        }
    }
}
