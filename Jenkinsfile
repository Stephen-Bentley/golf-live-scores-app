pipeline {
    agent { label 'built-in' }

    options {
        disableConcurrentBuilds()
        timestamps()
    }

    triggers { pollSCM('H/10 * * * *') }

    parameters {
        string(name: 'FAIRWAY_HOST_PORT', defaultValue: '7446', description: 'Homeserver port for Fairway Live.')
    }

    environment {
        FAIRWAY_IMAGE = "fairway-live:${BUILD_NUMBER}"
        DEPLOY_ENV_FILE = '/var/jenkins_home/secrets/fairway-live/.env.production'
    }

    stages {
        stage('Verify') {
            steps {
                sh '''
                    docker run --rm --volumes-from Jenkins --workdir "$WORKSPACE" \
                        node:22-alpine sh -ec 'npm ci && npm run lint && npm run typecheck && npm test'
                '''
            }
        }

        stage('Build image on homeserver') {
            steps {
                sh 'docker build --tag "$FAIRWAY_IMAGE" .'
            }
        }

        stage('Deploy to homeserver') {
            steps {
                sh '''
                    set -eu
                    if [ ! -r "$DEPLOY_ENV_FILE" ]; then
                        echo "Missing deployment settings: $DEPLOY_ENV_FILE" >&2
                        exit 1
                    fi

                    docker compose --project-name fairway-live --env-file "$DEPLOY_ENV_FILE" \
                        up -d --no-build --wait --wait-timeout 180
                '''
            }
        }
    }
}
