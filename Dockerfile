FROM node:22-alpine AS frontend-build

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


FROM maven:3.9-eclipse-temurin-21 AS backend-build

WORKDIR /app/backend

COPY backend/pom.xml ./
RUN mvn --batch-mode dependency:go-offline

COPY backend/src ./src

COPY --from=frontend-build /app/frontend/dist ./src/main/resources/static

RUN mvn --batch-mode clean package -DskipTests


FROM eclipse-temurin:21-jre

WORKDIR /app

RUN groupadd --gid 10001 devtrack && useradd --uid 10001 --gid devtrack --no-create-home devtrack

ENV SERVER_ADDRESS=0.0.0.0

COPY --from=backend-build \
    /app/backend/target/devtrack-0.0.1-SNAPSHOT.jar \
    app.jar

USER devtrack

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]