import { createSwaggerSpec } from "next-swagger-doc";

export const getApiDocs = async () => {
    const spec = createSwaggerSpec({
        apiFolder: "src/app/api", // define api folder
        definition: {
            openapi: "3.0.0",
            info: {
                title: "Zaltyko SaaS API",
                version: "1.0",
                description: "API pública para Zaltyko SaaS - Gestión de Academias",
                contact: {
                    name: "Soporte Zaltyko",
                    email: "support@zaltyko.com",
                },
            },
            components: {
                securitySchemes: {
                    BearerAuth: {
                        type: "http",
                        scheme: "bearer",
                        bearerFormat: "JWT",
                    },
                    ApiKeyAuth: {
                        type: "apiKey",
                        in: "header",
                        name: "X-API-KEY",
                    },
                },
            },
            security: [],
        },
    });
    return spec;
};
