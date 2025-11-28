import Papa from "papaparse";

export interface AthleteCSVRow {
    nombre: string;
    apellido?: string;
    email?: string;
    fechaNacimiento?: string;
    nivel?: string;
    grupo?: string;
}

export interface ParsedAthlete {
    name: string;
    email: string | null;
    birthDate: string | null;
    level: string | null;
    groupName: string | null;
}

export interface CSVParseResult {
    success: boolean;
    data: ParsedAthlete[];
    errors: Array<{ row: number; message: string }>;
    totalRows: number;
}

/**
 * Parse CSV file content to athlete data
 */
export function parseAthletesCSV(csvContent: string): CSVParseResult {
    const errors: Array<{ row: number; message: string }> = [];
    const parsedAthletes: ParsedAthlete[] = [];

    try {
        const parseResult = Papa.parse<AthleteCSVRow>(csvContent, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => {
                // Normalize headers (remove spaces, lowercase, remove accents)
                return header
                    .toLowerCase()
                    .trim()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/\s+/g, "");
            },
        });

        if (parseResult.errors.length > 0) {
            parseResult.errors.forEach((err) => {
                errors.push({
                    row: err.row || 0,
                    message: `Error de parsing: ${err.message}`,
                });
            });
        }

        parseResult.data.forEach((row, index) => {
            const rowNumber = index + 2; // +2 because: 1 for header, 1 for 0-index

            // Required field: nombre
            if (!row.nombre || row.nombre.trim() === "") {
                errors.push({
                    row: rowNumber,
                    message: "El campo 'Nombre' es obligatorio",
                });
                return;
            }

            // Combine nombre + apellido for full name
            const fullName = row.apellido
                ? `${row.nombre.trim()} ${row.apellido.trim()}`
                : row.nombre.trim();

            // Validate email format if provided
            const email = row.email?.trim() || null;
            if (email && !isValidEmail(email)) {
                errors.push({
                    row: rowNumber,
                    message: `Email inválido: ${email}`,
                });
            }

            // Validate birth date format if provided
            const birthDate = row.fechaNacimiento?.trim() || row.fechanacimiento?.trim() || null;
            if (birthDate && !isValidDate(birthDate)) {
                errors.push({
                    row: rowNumber,
                    message: `Fecha inválida: ${birthDate}. Usa formato YYYY-MM-DD`,
                });
            }

            parsedAthletes.push({
                name: fullName,
                email,
                birthDate,
                level: row.nivel?.trim() || null,
                groupName: row.grupo?.trim() || null,
            });
        });

        return {
            success: errors.length === 0,
            data: parsedAthletes,
            errors,
            totalRows: parseResult.data.length,
        };
    } catch (error) {
        return {
            success: false,
            data: [],
            errors: [
                {
                    row: 0,
                    message: `Error procesando CSV: ${error instanceof Error ? error.message : "Error desconocido"}`,
                },
            ],
            totalRows: 0,
        };
    }
}

function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function isValidDate(dateString: string): boolean {
    // Accept YYYY-MM-DD format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateString)) return false;

    const date = new Date(dateString);
    return !isNaN(date.getTime());
}

/**
 * Generate CSV template content
 */
export function generateCSVTemplate(): string {
    const headers = ["Nombre", "Apellido", "Email", "Fecha Nacimiento", "Nivel", "Grupo (opcional)"];
    const exampleRow = [
        "Juan",
        "Pérez",
        "juan@email.com",
        "2010-05-15",
        "Principiante",
        "Grupo A",
    ];

    return `${headers.join(",")}\n${exampleRow.join(",")}`;
}
