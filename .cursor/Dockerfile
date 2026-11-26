FROM node:26-bookworm@sha256:b7087bc4d973034b30854b378ba107f9fab622b47514cb7e2592e41b8bab8d49

# Original GitHub CLI package source. No credentials are baked into this image.
RUN curl --fail --silent --show-error --location \
      https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      --output /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && printf 'deb [arch=%s signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main\n' \
      "$(dpkg --print-architecture)" \
      > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install --yes --no-install-recommends gh ripgrep \
    && rm -rf /var/lib/apt/lists/*
