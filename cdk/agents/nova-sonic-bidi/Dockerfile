FROM public.ecr.aws/docker/library/python:3.13-slim

WORKDIR /app

# pyaudioビルドに必要な依存関係（assert.hを含む）
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    portaudio19-dev \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv
ENV UV_SYSTEM_PYTHON=1 UV_COMPILE_BYTECODE=1

COPY requirements.txt requirements.txt
RUN uv pip install --system -r requirements.txt
# pyaudioが正しくインストールされたか確認
RUN python -c "import pyaudio; print('pyaudio ok:', pyaudio.__version__)"
RUN uv pip install --system "aws-opentelemetry-distro>=0.10.1"

# 環境変数
ENV AWS_REGION=us-west-2
ENV AWS_DEFAULT_REGION=us-west-2
ENV DOCKER_CONTAINER=1

# 非rootユーザー作成
RUN useradd -m -u 1000 bedrock_agentcore
USER bedrock_agentcore

# エージェントコードをコピー
COPY . .

EXPOSE 8080

CMD ["opentelemetry-instrument", "python", "-m", "agent"]
