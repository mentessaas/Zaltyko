"use client";

import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

export default function ApiDoc() {
    return (
        <div className="container mx-auto py-10">
            <div className="rounded-lg border bg-card shadow-sm">
                <SwaggerUI url="/api/docs" />
            </div>
        </div>
    );
}
