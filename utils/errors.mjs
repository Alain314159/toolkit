// Clase de error personalizada para el Toolkit
export class ToolkitError extends Error {
  constructor(message, file = null) {
    super(message);
    this.name = 'ToolkitError';
    this.file = file;
  }
}
