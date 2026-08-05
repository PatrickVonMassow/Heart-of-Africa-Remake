FROM node:20

ARG TZ
ENV TZ="$TZ"

ARG CLAUDE_CODE_VERSION=latest

# Install basic development tools and iptables/ipset
RUN apt-get update && apt-get install -y --no-install-recommends \
  less \
  git \
  procps \
  sudo \
  fzf \
  zsh \
  man-db \
  unzip \
  gnupg2 \
  gh \
  iptables \
  ipset \
  iproute2 \
  dnsutils \
  aggregate \
  jq \
  nano \
  vim \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libatspi2.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libnspr4 \
  libnss3 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  fonts-ipafont-gothic \
  fonts-noto-color-emoji \
  fonts-unifont \
  fonts-wqy-zenhei \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# The GPU stack and a system Chrome (04.08.2026, point 493).
#
# Measured inside the container BEFORE this block existed: WebGL 2 came up as SwiftShader —
# pure software, which is why every browser suite crawled — and `navigator.gpu` was UNDEFINED
# in Playwright's bundled Chromium, so the WebGPU lane could not open at all. The card was
# already reachable (/dev/dxg and /usr/lib/wsl are handed in by devcontainer.json); what was
# missing was a driver stack to use it and a browser able to drive it.
#
# It has to happen at BUILD time. At runtime the firewall's allowlist decides what apt may
# reach, and it binds root exactly as it binds node — the image build runs before that fence
# exists, so this is the one place the install can succeed at all.
#
# What each half buys, honestly: Mesa's d3d12 driver on /dev/dxg is the standard WSL path and
# takes WebGL 2 off the CPU — that is the speed. WebGPU needs Vulkan over D3D12 (dzn) on top,
# which is experimental. `node scripts/verify/backend-lane-check.mjs` says which of the two
# actually carries, judged at the picture rather than at a version string.
RUN apt-get update && apt-get install -y --no-install-recommends \
  libvulkan1 \
  mesa-vulkan-drivers \
  libgl1-mesa-dri \
  vulkan-tools \
  ca-certificates \
  curl \
  && install -d -m 0755 /etc/apt/keyrings \
  && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
       | gpg --dearmor -o /etc/apt/keyrings/google-chrome.gpg \
  && echo 'deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main' \
       > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
  && echo /usr/lib/wsl/lib > /etc/ld.so.conf.d/wsl.conf && ldconfig \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# node:20 bundles npm 10.8.2, which does not know the lockfile's `libc` field and SILENTLY
# STRIPS it — 63 optional platform packages, on every `npm install`, leaving the tree dirty
# after each container create (postCreateCommand runs one). npm 11 preserves it, so the
# image carries npm 11 and `npm install` is a no-op on a current lockfile.
RUN npm install -g npm@11 && npm --version

# Ensure default node user has access to /usr/local/share
RUN mkdir -p /usr/local/share/npm-global && \
  chown -R node:node /usr/local/share

ARG USERNAME=node

# Persist bash history.
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  && mkdir /commandhistory \
  && touch /commandhistory/.bash_history \
  && chown -R $USERNAME /commandhistory

# Set `DEVCONTAINER` environment variable to help with orientation
ENV DEVCONTAINER=true

# Create workspace and config directories and set permissions.
# /workspace/hoa/node_modules exists in the IMAGE on purpose: the named volume
# mounted there inherits this directory's ownership, so `npm install` runs as
# node. Without it Docker would create the mount point owned by root — which mattered
# before this image granted node passwordless root (see the sudoers block at the end).
RUN mkdir -p /workspace/hoa/node_modules /home/node/.claude && \
  chown -R node:node /workspace /home/node/.claude

WORKDIR /workspace

ARG GIT_DELTA_VERSION=0.18.2
RUN ARCH=$(dpkg --print-architecture) && \
  wget "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  sudo dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

# Set up non-root user
USER node

# Install global packages
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# Set the default shell to zsh rather than sh
ENV SHELL=/bin/zsh

# Set the default editor and visual
ENV EDITOR=nano
ENV VISUAL=nano

# Default powerline10k theme
ARG ZSH_IN_DOCKER_VERSION=1.2.0
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh)" -- \
  -p git \
  -p fzf \
  -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
  -a "source /usr/share/doc/fzf/examples/completion.zsh" \
  -a "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  -x

# Install Claude
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# The verification browser, baked in (04.08.2026).
# It used to be installed BY HAND, into a path on the container's own filesystem — so the
# next rebuild would have taken the picture verification with it without a word, and the
# session after that would have found no browser at all. PLAYWRIGHT_BROWSERS_PATH in
# devcontainer.json points the suites at this same path.
ENV PLAYWRIGHT_BROWSERS_PATH=/home/node/.pw-browsers
RUN npx --yes playwright@latest install chromium

# Copy and set up firewall script
COPY init-firewall.sh /usr/local/bin/
USER root
RUN chmod +x /usr/local/bin/init-firewall.sh && \
  echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall && \
  chmod 0440 /etc/sudoers.d/node-firewall

# Root without a password for the container user (user's decision 04.08.2026).
# The rule behind it: no step inside this container is handed back to the user. Upstream
# grants `node` exactly one passwordless command, which is why two attempts to install the
# GPU stack dead-ended and cost him two round trips.
#
# BE CLEAR ABOUT WHAT THIS COSTS (found by the four-eyes review): the egress firewall stays
# CONFIGURED, but it is no longer a hard boundary against anything running as `node` — that
# now includes `sudo iptables -F`, and an npm postinstall script runs as `node` too. Before,
# the one permitted root command could only SET rules. What remains is a fence against
# accidental traffic, not against deliberate action from inside.
RUN echo "node ALL=(root) NOPASSWD: ALL" > /etc/sudoers.d/node-all && \
  chmod 0440 /etc/sudoers.d/node-all
USER node
