export DATABASE_URL=postgresql://sakhi:sakhi_dev_pw@localhost:5432/sakhisetu
export SESSION_SECRET=dev-only-secret-for-local-testing-0123456789
export DEMO_MODE=true
export PORT=5000 BASE_PATH=/
pg_lsclusters | grep -q online || pg_ctlcluster 16 main start; sleep 2
