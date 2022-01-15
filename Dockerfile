FROM alpine
RUN apk add -u bash curl nodejs npm git unzip && npm install -g fx

