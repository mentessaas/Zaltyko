/**
 * @vitest-environment jsdom
 *
 * Tests focales del contrato observable de QuickPaymentModal y QuickClassModal
 * (ZAL-804). El envelope canonico es { ok, data, error }; los modales deben:
 *   - Llamar onSuccess una sola vez cuando ok === true y HTTP 2xx.
 *   - Mostrar mensaje visible con aria-live cuando !ok o HTTP no-2xx.
 *   - Mostrar mensaje localizado cuando la red falla (fetch rechaza).
 *
 * Los tests usan fetch mockeado. No tocan BD, Supabase ni rutas reales.
 *
 * Para QuickClassModal mockeamos el wrapper <Select> (cosmético y no
 * interactivo en jsdom) por un <select> nativo con <option> reales; el
 * resto del formulario y la lógica de validación/react-hook-form se
 * ejercitan tal cual.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { QuickPaymentModal } from "@/components/dashboard/QuickPaymentModal";
import { QuickClassModal } from "@/components/dashboard/QuickClassModal";

// Mock del wrapper <Select> del proyecto: no es interactivo en jsdom
// porque el <select> nativo se renderiza sin <option> reales (los
// SelectItem quedan en un <div> hermano). Para los tests focales del
// contrato de respuesta necesitamos poder seleccionar un valor y
// habilitar el submit del formulario.
vi.mock("@/components/ui/select", async () => {
    const ReactReal = await import("react");
    // Identidad estable para reconocer <SelectContent> dentro de los
    // children que nos pasa QuickClassModal.
    const MockSelectContent = ({
        children,
    }: {
        children?: React.ReactNode;
    }) => ReactReal.createElement(ReactReal.Fragment, null, children);
    return {
        Select: ({
            value,
            onValueChange,
            children,
        }: {
            value?: string;
            onValueChange?: (v: string) => void;
            children?: React.ReactNode;
        }) => {
            // Render only real <option> children (skip SelectTrigger /
            // SelectContent wrappers). The selectedClass flows through
            // onValueChange -> setValue in the form.
            const options: React.ReactElement[] = [];
            ReactReal.Children.forEach(children, (child) => {
                if (!ReactReal.isValidElement(child)) return;
                // <SelectContent> holds the options
                const contentChild =
                    child as React.ReactElement<{ children?: React.ReactNode }>;
                if (contentChild.type === MockSelectContent) {
                    ReactReal.Children.forEach(
                        contentChild.props.children,
                        (item) => {
                            if (!ReactReal.isValidElement(item)) return;
                            const itemEl =
                                item as React.ReactElement<{
                                    value: string;
                                    children?: React.ReactNode;
                                }>;
                            options.push(
                                ReactReal.createElement(
                                    "option",
                                    {
                                        key: itemEl.props.value,
                                        value: itemEl.props.value,
                                    },
                                    itemEl.props.children
                                )
                            );
                        }
                    );
                }
            });
            return ReactReal.createElement(
                "select",
                {
                    "data-testid": "class-select",
                    value: value ?? "",
                    onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                        onValueChange?.(e.target.value),
                },
                ReactReal.createElement(
                    "option",
                    { value: "" },
                    "Selecciona una clase"
                ),
                ...options
            );
        },
        SelectTrigger: ({ children }: { children?: React.ReactNode }) =>
            ReactReal.createElement("div", null, children),
        SelectValue: ({ placeholder }: { placeholder?: string }) =>
            ReactReal.createElement("span", null, placeholder),
        SelectContent: MockSelectContent,
        SelectItem: () => null,
    };
});

const ORIGINAL_FETCH = global.fetch;

const jsonResponse = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });

describe("QuickPaymentModal — contrato de respuesta (ZAL-804)", () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
        global.fetch = ORIGINAL_FETCH;
        vi.restoreAllMocks();
    });

    const renderModal = (callbacks: { onSuccess: () => void; onClose: () => void }) => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse(200, {
                ok: true,
                data: [
                    {
                        id: "charge-1",
                        athleteId: "athlete-1",
                        athleteName: "Atleta Test",
                        amountCents: 1000,
                        dueDate: "2026-08-20",
                    },
                ],
            })
        );
        return render(
            <QuickPaymentModal
                isOpen={true}
                onClose={callbacks.onClose}
                onSuccess={callbacks.onSuccess}
            />
        );
    };

    it("top-level {ok:true,...} ejecuta onSuccess una sola vez", async () => {
        const user = userEvent.setup();
        const onSuccess = vi.fn();
        renderModal({ onSuccess, onClose: vi.fn() });

        await waitFor(() => {
            expect(screen.getByText("Confirmar Pago")).toBeInTheDocument();
        });

        fetchMock.mockResolvedValueOnce(
            jsonResponse(200, {
                ok: true,
                data: { charge: { id: "charge-1", status: "paid" } },
            })
        );

        await user.click(screen.getByRole("button", { name: /confirmar pago/i }));

        await waitFor(() => {
            expect(onSuccess).toHaveBeenCalledTimes(1);
        });
        expect(
            screen.queryByTestId("quick-payment-error")
        ).not.toBeInTheDocument();
    });

    it("HTTP 4xx NO ejecuta onSuccess y muestra mensaje con aria-live", async () => {
        const user = userEvent.setup();
        const onSuccess = vi.fn();
        renderModal({ onSuccess, onClose: vi.fn() });

        await waitFor(() => {
            expect(screen.getByText("Confirmar Pago")).toBeInTheDocument();
        });

        fetchMock.mockResolvedValueOnce(
            jsonResponse(404, {
                ok: false,
                error: "NOT_FOUND",
                message: "Cargo no encontrado",
            })
        );

        await user.click(screen.getByRole("button", { name: /confirmar pago/i }));

        const errorEl = await screen.findByTestId("quick-payment-error");
        expect(errorEl).toHaveAttribute("role", "alert");
        expect(errorEl).toHaveAttribute("aria-live", "assertive");
        expect(errorEl).toHaveTextContent("Cargo no encontrado");
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it("HTTP 5xx NO ejecuta onSuccess y muestra fallback localizado", async () => {
        const user = userEvent.setup();
        const onSuccess = vi.fn();
        renderModal({ onSuccess, onClose: vi.fn() });

        await waitFor(() => {
            expect(screen.getByText("Confirmar Pago")).toBeInTheDocument();
        });

        fetchMock.mockResolvedValueOnce(
            jsonResponse(500, {
                ok: false,
                error: "INTERNAL_ERROR",
                message: "Error interno del servidor",
            })
        );

        await user.click(screen.getByRole("button", { name: /confirmar pago/i }));

        const errorEl = await screen.findByTestId("quick-payment-error");
        expect(errorEl).toHaveAttribute("aria-live", "assertive");
        expect(errorEl).toHaveTextContent("Error interno del servidor");
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it("fallo de red NO ejecuta onSuccess y muestra mensaje de conexion", async () => {
        const user = userEvent.setup();
        const onSuccess = vi.fn();
        renderModal({ onSuccess, onClose: vi.fn() });

        await waitFor(() => {
            expect(screen.getByText("Confirmar Pago")).toBeInTheDocument();
        });

        fetchMock.mockRejectedValueOnce(new Error("NetworkError"));

        await user.click(screen.getByRole("button", { name: /confirmar pago/i }));

        const errorEl = await screen.findByTestId("quick-payment-error");
        expect(errorEl).toHaveTextContent("Error de conexion");
        expect(errorEl).toHaveAttribute("aria-live", "assertive");
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it("respuesta no-JSON NO ejecuta onSuccess", async () => {
        const user = userEvent.setup();
        const onSuccess = vi.fn();
        renderModal({ onSuccess, onClose: vi.fn() });

        await waitFor(() => {
            expect(screen.getByText("Confirmar Pago")).toBeInTheDocument();
        });

        fetchMock.mockResolvedValueOnce(
            new Response("not-json-at-all", {
                status: 200,
                headers: { "Content-Type": "text/plain" },
            })
        );

        await user.click(screen.getByRole("button", { name: /confirmar pago/i }));

        const errorEl = await screen.findByTestId("quick-payment-error");
        expect(errorEl).toBeInTheDocument();
        expect(onSuccess).not.toHaveBeenCalled();
    });
});

describe("QuickClassModal — contrato de respuesta (ZAL-804)", () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
        global.fetch = ORIGINAL_FETCH;
        vi.restoreAllMocks();
    });

    const renderModal = (callbacks: { onSuccess: () => void; onClose: () => void }) => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse(200, {
                ok: true,
                data: [
                    { id: "11111111-1111-1111-1111-111111111111", name: "Clase A" },
                ],
            })
        );
        return render(
            <QuickClassModal
                isOpen={true}
                onClose={callbacks.onClose}
                onSuccess={callbacks.onSuccess}
            />
        );
    };

    const selectFirstClass = async (
        user: ReturnType<typeof userEvent.setup>
    ) => {
        // El mock del <Select> expone un <select> nativo con role=combobox
        // y options reales. user.selectOptions dispara el onChange sintetico
        // que enruta via onValueChange -> setValue("classId", ..., true).
        const select = screen.getByTestId("class-select") as HTMLSelectElement;
        const firstOptionValue = select.querySelector("option:not([value=''])")?.value;
        if (!firstOptionValue) {
            throw new Error("no selectable option rendered");
        }
        await user.selectOptions(select, firstOptionValue);
        await waitFor(() => {
            expect(
                screen.getByRole("button", { name: /crear clase/i })
            ).not.toBeDisabled();
        });
    };

    it("top-level {ok:true,...} ejecuta onSuccess una sola vez", async () => {
        const user = userEvent.setup();
        const onSuccess = vi.fn();
        renderModal({ onSuccess, onClose: vi.fn() });

        await waitFor(() => {
            expect(screen.getByRole("combobox")).toBeInTheDocument();
        });

        await selectFirstClass(user);

        fetchMock.mockResolvedValueOnce(
            jsonResponse(200, {
                ok: true,
                data: { session: { id: "session-1" } },
            })
        );

        await user.click(screen.getByRole("button", { name: /crear clase/i }));

        await waitFor(() => {
            expect(onSuccess).toHaveBeenCalledTimes(1);
        });
        expect(
            screen.queryByTestId("quick-class-error")
        ).not.toBeInTheDocument();
    });

    it("HTTP 4xx NO ejecuta onSuccess y muestra mensaje con aria-live", async () => {
        const user = userEvent.setup();
        const onSuccess = vi.fn();
        renderModal({ onSuccess, onClose: vi.fn() });

        await waitFor(() => {
            expect(screen.getByRole("combobox")).toBeInTheDocument();
        });

        await selectFirstClass(user);

        fetchMock.mockResolvedValueOnce(
            jsonResponse(404, {
                ok: false,
                error: "NOT_FOUND",
                message: "Clase no encontrada",
            })
        );

        await user.click(screen.getByRole("button", { name: /crear clase/i }));

        const errorEl = await screen.findByTestId("quick-class-error");
        expect(errorEl).toHaveAttribute("role", "alert");
        expect(errorEl).toHaveAttribute("aria-live", "assertive");
        expect(errorEl).toHaveTextContent("Clase no encontrada");
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it("HTTP 5xx NO ejecuta onSuccess y muestra mensaje visible", async () => {
        const user = userEvent.setup();
        const onSuccess = vi.fn();
        renderModal({ onSuccess, onClose: vi.fn() });

        await waitFor(() => {
            expect(screen.getByRole("combobox")).toBeInTheDocument();
        });

        await selectFirstClass(user);

        fetchMock.mockResolvedValueOnce(
            jsonResponse(500, {
                ok: false,
                error: "INTERNAL_ERROR",
                message: "Error al crear la sesion",
            })
        );

        await user.click(screen.getByRole("button", { name: /crear clase/i }));

        const errorEl = await screen.findByTestId("quick-class-error");
        expect(errorEl).toHaveAttribute("aria-live", "assertive");
        expect(errorEl).toHaveTextContent("Error al crear la sesion");
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it("fallo de red NO ejecuta onSuccess y muestra mensaje de conexion", async () => {
        const user = userEvent.setup();
        const onSuccess = vi.fn();
        renderModal({ onSuccess, onClose: vi.fn() });

        await waitFor(() => {
            expect(screen.getByRole("combobox")).toBeInTheDocument();
        });

        await selectFirstClass(user);

        fetchMock.mockRejectedValueOnce(new Error("NetworkError"));

        await user.click(screen.getByRole("button", { name: /crear clase/i }));

        const errorEl = await screen.findByTestId("quick-class-error");
        expect(errorEl).toHaveTextContent("Error de conexion");
        expect(errorEl).toHaveAttribute("aria-live", "assertive");
        expect(onSuccess).not.toHaveBeenCalled();
    });
});
