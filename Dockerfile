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

ENV SERVER_ADDRESS=0.0.0.0
ENV SERVER_PORT=8080

COPY --from=backend-build \
    /app/backend/target/devtrack-0.0.1-SNAPSHOT.jar \
    app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]