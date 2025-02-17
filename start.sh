#!/bin/bash
cd /home2/mediades/api-firme.mediadesignro.ro/backend
export NODE_ENV=production
export MONGODB_URL=mongodb+srv://tirlapetru:Maracas123@ecommerce-platform.ea4mo.mongodb.net/lista-firme
export PORT=3000
# Add other env variables here

npm install
npm run build  # if you have a build step
pm2 start ecosystem.config.json