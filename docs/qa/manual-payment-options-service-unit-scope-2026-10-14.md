# Cobertura unitaria de opciones de pagos manuales

`tests/manual-payment-options-service.test.ts` cubre el mapeo de un cargo mensual por gimnasta de 3.500 céntimos con `enrollment_id` nulo, el saldo tras una asignación parcial, el rechazo de rol coach y los predicados/valores enlazados de organización, sedes autorizadas, estados y saldo pendiente.

El test sustituye `db.execute` y compila el objeto SQL con `PgDialect`. Verifica el contrato de consulta y el mapeo del servicio; **no ejecuta SQL en PostgreSQL y no demuestra RLS, aislamiento runtime, joins ni agregaciones reales**. Queda como cobertura separada validar el emisor mensual y las opciones de pagos juntas en un harness PostgreSQL aislado cuando QA lo autorice.
