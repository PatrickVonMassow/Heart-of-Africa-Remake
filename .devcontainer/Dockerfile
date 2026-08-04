# Heart of Africa — dev container.
#
# The official Claude Code image (anthropics/claude-code, .devcontainer/Dockerfile) with the
# four additions this project's verification needs. Everything not marked HoA is verbatim
# upstream, so a later upstream change stays easy to merge.
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
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# ── HoA 1/4: the GPU stack and a system Chrome ────────────────────────────────────────────
# Measured 04.08.2026 inside the unmodified container: WebGL 2 came up as SwiftShader — pure
# software, which is why every browser suite crawled — and `navigator.gpu` was UNDEFINED in
# Playwright's bundled Chromium, so the WebGPU lane could not open at all. /dev/dxg and the
# D3D12 libraries were already reachable; what was missing was a driver stack to use them and
# a browser to drive it. Installed here rather than at runtime because the sandbox firewall
# blocks the package sources for root as well — the image build runs before that fence exists.
#
# What each half buys, honestly: Mesa's d3d12 driver on /dev/dxg is the standard WSL path and
# takes WebGL 2 off the CPU (the speed). WebGPU additionally needs Vulkan over D3D12 (dzn),
# which is experimental — `node scripts/verify/backend-lane-check.mjs` says which of the two
# actually carries, judged at the picture.
RUN apt-get update && apt-get install -y --no-install-recommends \
  libvulkan1 \
  mesa-vulkan-drivers \
  libgl1-mesa-dri \
  vulkan-tools \
  ca-certificates \
  curl \
  fonts-liberation \
  fonts-dejavu-core \
  fonts-noto-color-emoji \
  locales \
  && install -d -m 0755 /etc/apt/keyrings \
  && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
       | gpg --dearmor -o /etc/apt/keyrings/google-chrome.gpg \
  && echo 'deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main' \
       > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
  && echo /usr/lib/wsl/lib > /etc/ld.so.conf.d/wsl.conf && ldconfig \
  && sed -i 's/^# *\(en_US.UTF-8\)/\1/' /etc/locale.gen && locale-gen \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV LANG=en_US.UTF-8

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

# Create workspace and config directories and set permissions
RUN mkdir -p /workspace /home/node/.claude && \
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

# ── HoA 2/4: the verification browser, baked in ───────────────────────────────────────────
# It was installed BY HAND in an earlier session, into a path on the container's own
# filesystem — so a rebuild would have silently taken the picture verification with it, and
# the next session would have found no browser at all. Baked in here, it survives every
# rebuild; the fixed path is what the suites read through PLAYWRIGHT_BROWSERS_PATH.
ENV PLAYWRIGHT_BROWSERS_PATH=/home/node/.pw-browsers
RUN npx --yes playwright@latest install chromium

# Copy and set up firewall script
COPY init-firewall.sh /usr/local/bin/
USER root
RUN chmod +x /usr/local/bin/init-firewall.sh && \
  echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall && \
  chmod 0440 /etc/sudoers.d/node-firewall

# ── HoA 3/4: root without a password for the container user ───────────────────────────────
# The user's decision of 04.08.2026: no step inside this container is handed back to him.
# Upstream grants `node` exactly one passwordless command (the firewall script), which is why
# two attempts to install the GPU stack dead-ended and cost him two round trips. With this,
# the session installs, repairs and re-runs whatever the verification needs on its own.
# It widens the image's hardening deliberately — the fence that matters here is the firewall
# above, which stays untouched and keeps binding root too.
RUN echo "node ALL=(root) NOPASSWD: ALL" > /etc/sudoers.d/node-all && \
  chmod 0440 /etc/sudoers.d/node-all

# ── HoA 4/4: the GPU device is not enough on its own ──────────────────────────────────────
# devcontainer.json must also pass the card through, or none of the above can reach it:
#   "runArgs": ["--device=/dev/dxg"],
#   "mounts": [{"source":"/usr/lib/wsl","target":"/usr/lib/wsl","type":"bind","readonly":true}]
# If the host exposes no WSL GPU, that device argument prevents the container from starting —
# removing both lines is the way back, at the cost of software rendering.

USER node
