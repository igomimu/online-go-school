#!/bin/bash
# online-go-school を LEGION に同期
rsync -avz --exclude-from="$(dirname "$0")/.rsyncignore" "$(dirname "$0")/" legion:/home/mimura/online-go-school/
