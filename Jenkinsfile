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

        stage('Build Docker image') {
            steps {
                sh 'docker build --tag ${IMAGE_NAME}:${BUILD_NUMBER} --tag ${IMAGE_NAME}:latest .'
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
                        SSH_OPTS="-o UserKnownHostsFile=${SSH_DIR}/known_hosts -o StrictHostKeyChecking=yes"
                        export SSHPASS="${PI_PASSWORD}"

                        sshpass -e ssh ${SSH_OPTS} "${PI_USER}@${PI_HOST}" \\
                            "mkdir -p '${PI_DEPLOY_DIR}'"

                        sshpass -e scp ${SSH_OPTS} docker-compose.yml \\
                            "${PI_USER}@${PI_HOST}:${PI_DEPLOY_DIR}/docker-compose.yml"

                        docker save "${IMAGE_NAME}:${BUILD_NUMBER}" | gzip | \\
                            sshpass -e ssh ${SSH_OPTS} "${PI_USER}@${PI_HOST}" \\
                            'gunzip | docker load'

                        sshpass -e ssh ${SSH_OPTS} "${PI_USER}@${PI_HOST}" \\
                            "test -f '${PI_DEPLOY_DIR}/.env' || { echo 'Missing ${PI_DEPLOY_DIR}/.env on the Pi.'; exit 1; }"

                        sshpass -e ssh ${SSH_OPTS} "${PI_USER}@${PI_HOST}" \\
                            "IMAGE_NAME='${IMAGE_NAME}' BUILD_NUMBER='${BUILD_NUMBER}' FAIRWAY_HOST_PORT='${FAIRWAY_HOST_PORT}' PI_DEPLOY_DIR='${PI_DEPLOY_DIR}' sh -s" <<'REMOTE_PI'
                        set -eu
                        cd "$PI_DEPLOY_DIR"
                        docker compose -p fairway-live up -d db
                        docker rm --force fairway-live-app 2>/dev/null || true
                        docker run --detach \\
                            --name fairway-live-app \\
                            --restart unless-stopped \\
                            --network fairway-live_default \\
                            --env-file "$PI_DEPLOY_DIR/.env" \\
                            --env DATABASE_URL='postgresql://postgres:postgres@db:5432/fairway_live?schema=public' \\
                            --env NODE_ENV=production \\
                            --env PORT=3000 \\
                            --env HOSTNAME=0.0.0.0 \\
                            --publish "$FAIRWAY_HOST_PORT:3000" \\
                            "$IMAGE_NAME:$BUILD_NUMBER"
REMOTE_PI
REMOTE_DEPLOY
                    '''
                }
            }
        }
    }
}
