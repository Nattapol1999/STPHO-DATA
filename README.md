[render.yaml](https://github.com/user-attachments/files/32889250/render.yaml)
# A-complete-AI-agencyservices:
  - type: web
    name: moph-surat-line-relay
    runtime: node
    plan: free
    rootDir: line-relay-render
    buildCommand: npm install --omit=dev
    startCommand: npm start
    healthCheckPath: /health
    autoDeploy: true
    envVars:
      - key: NODE_ENV
        value: production
      - key: LINE_CHANNEL_SECRET
        sync: false
      - key: RELAY_KEY
        sync: false
