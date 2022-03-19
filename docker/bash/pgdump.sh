#!/bin/bash

DUMPFILE=bridge-api-$(date +%Y-%m-%d).tar.gz
docker exec postgres pg_dump -U bridge -F t --data-only bridge | gzip > $DUMPFILE
gsutil -q mv $DUMPFILE gs://tonic-west3
