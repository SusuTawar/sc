# CircleCI Manual Image Upload (`docker load`)

Use this flow when you do not want to pull from a registry on the VPS.
For the new direct webhook upload method, see `docs/ci-webhook-api.md`.

## 1) Build and export image in CircleCI

Example steps (inside your CircleCI job):

```bash
docker build -t myorg/myapp:${CIRCLE_SHA1} .
docker save myorg/myapp:${CIRCLE_SHA1} | gzip > myapp-${CIRCLE_SHA1}.tar.gz
```

Then store `myapp-${CIRCLE_SHA1}.tar.gz` as a CircleCI artifact.

## 2) Download artifact and upload to VPS

From your local machine:

```bash
scp myapp-<tag>.tar.gz user@your-vps:/tmp/
```

## 3) Load image on VPS

On VPS:

```bash
cd /path/to/servercommander
bash scripts/docker-load-artifact.sh /tmp/myapp-<tag>.tar.gz
```

Optional: retag during load to match your app repo/tag:

```bash
bash scripts/docker-load-artifact.sh /tmp/myapp-<tag>.tar.gz myorg/myapp:<tag>
```

## 4) Deploy with ServerCommander

Make sure `/app-create` uses `image_repo` equal to the loaded image repository.

Example mapping:

- Loaded image: `myorg/myapp:abc123`
- `image_repo`: `myorg/myapp`
- `/deploy ... image_tag`: `abc123`

ServerCommander then runs container with `myorg/myapp:abc123` without doing `docker pull`.
