-- Iniciales con las que la secretaría firma el recibo físico (LBZ, PAG, MRCM, EASO).
-- Se copian a Pago.iniciales al cobrar, para empatar el historial digital con
-- el libro de papel sin capturarlas a mano.
ALTER TABLE "User" ADD COLUMN "iniciales" TEXT;
