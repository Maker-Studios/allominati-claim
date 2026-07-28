FROM ghcr.io/foundry-rs/foundry:latest

USER root

COPY docker/anvil/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# JSON-RPC over HTTP + WebSocket on the same port
EXPOSE 8545

ENTRYPOINT ["/entrypoint.sh"]
