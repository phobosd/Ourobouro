<#
.SYNOPSIS
    Interactive deployment script for Zenith-9 to Google Cloud Platform & Firebase.
.DESCRIPTION
    Automates the provisioning of Redis, VPC Access, Cloud Run deployment, and Firebase Hosting.
    Prerequisites: gcloud SDK, Docker, Firebase CLI.
#>

$ErrorActionPreference = "Stop"

function Write-Header {
    param($text)
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host " $text" -ForegroundColor White
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Check-Command {
    param($cmd, $name)
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Error "$name is not installed or not in PATH. Please install it first."
        exit 1
    }
}

# --- 1. Prerequisites Check ---
Write-Header "Checking Prerequisites"
Check-Command "gcloud" "Google Cloud SDK"
Check-Command "docker" "Docker"
Check-Command "firebase" "Firebase CLI"
Write-Host "All tools found." -ForegroundColor Green

# --- 2. Configuration ---
Write-Header "Configuration"
$ProjectId = Read-Host "Enter your Google Cloud Project ID"
$Region = Read-Host "Enter Target Region (default: us-central1)"
if ([string]::IsNullOrWhiteSpace($Region)) { $Region = "us-central1" }

Write-Host "Setting project to $ProjectId..."
gcloud config set project $ProjectId

# --- 3. Enable APIs ---
Write-Header "Enabling Google Cloud APIs"
Write-Host "Enabling Cloud Run, Redis, VPC Access, Artifact Registry, and Compute APIs..."
gcloud services enable run.googleapis.com redis.googleapis.com vpcaccess.googleapis.com artifactregistry.googleapis.com compute.googleapis.com
Write-Host "APIs enabled." -ForegroundColor Green

# --- 4. Networking & Redis (The slow part) ---
Write-Header "Infrastructure Setup (Redis & VPC)"
$VpcConnector = "zenith-vpc-connector"
$RedisName = "zenith-redis"

# Check if VPC Connector exists
$ConnectorCheck = gcloud compute networks vpc-access connectors list --region $Region --filter="name:$VpcConnector" --format="value(name)"
if (-not $ConnectorCheck) {
    Write-Host "Creating VPC Connector '$VpcConnector' (this may take a few minutes)..."
    gcloud compute networks vpc-access connectors create $VpcConnector `
        --region $Region `
        --range 10.8.0.0/28
}
else {
    Write-Host "VPC Connector '$VpcConnector' already exists." -ForegroundColor Yellow
}

# Check if Redis exists
$RedisCheck = gcloud redis instances list --region $Region --filter="name:projects/$ProjectId/locations/$Region/instances/$RedisName" --format="value(name)"
if (-not $RedisCheck) {
    Write-Host "Creating Redis Instance '$RedisName' (this may take 10-15 minutes)..."
    gcloud redis instances create $RedisName `
        --size=1 --region=$Region --tier=basic --redis-version=redis_6_x
}
else {
    Write-Host "Redis Instance '$RedisName' already exists." -ForegroundColor Yellow
}

# Get Redis IP
Write-Host "Fetching Redis details..."
$RedisHost = gcloud redis instances describe $RedisName --region $Region --format="value(host)"
$RedisPort = gcloud redis instances describe $RedisName --region $Region --format="value(port)"
Write-Host "Redis is at $RedisHost`:$RedisPort" -ForegroundColor Green

# --- 5. Deploy Server to Cloud Run ---
Write-Header "Deploying Server to Cloud Run"

# Create Dockerfile if missing
if (-not (Test-Path "server/Dockerfile")) {
    Write-Host "Creating server/Dockerfile..."
    $DockerContent = @"
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
"@
    Set-Content -Path "server/Dockerfile" -Value $DockerContent
}

$ImageName = "gcr.io/$ProjectId/zenith-server"
Write-Host "Building Docker image '$ImageName'..."
docker build -t $ImageName ./server

Write-Host "Pushing Docker image (ensure Docker is authenticated with gcloud)..."
gcloud auth configure-docker --quiet
docker push $ImageName

Write-Host "Deploying to Cloud Run..."
gcloud run deploy zenith-server `
    --image $ImageName `
    --platform managed `
    --region $Region `
    --allow-unauthenticated `
    --port 3000 `
    --set-env-vars="REDIS_HOST=$RedisHost,REDIS_PORT=$RedisPort,NODE_ENV=production" `
    --vpc-connector $VpcConnector

# Get Server URL
$ServerUrl = gcloud run services describe zenith-server --platform managed --region $Region --format="value(status.url)"
Write-Host "Server deployed at: $ServerUrl" -ForegroundColor Green

# --- 6. Deploy Client to Firebase ---
Write-Header "Deploying Client to Firebase"

Write-Host "Updating client environment variables..."
$EnvPath = "client/.env.production"
Set-Content -Path $EnvPath -Value "VITE_SERVER_URL=$ServerUrl"

Write-Host "Building Client..."
Push-Location client
npm install
npm run build
Pop-Location

Write-Host "Deploying to Firebase Hosting..."
firebase deploy --only hosting

Write-Header "Deployment Complete!"
Write-Host "Game Client: (Check Firebase Output above)"
Write-Host "Game Server: $ServerUrl"
