/**
 * Esquemas que espera la API REST del BUK existente (módulo de Selección).
 *
 * Extraídos del spec OpenAPI oficial de Buk — ver
 * `referencia_api_buk.md` en la carpeta del proyecto.
 *
 * OJO: esto es la API pública de BUK en general. La cuenta de la empresa
 * puede tener campos personalizados o permisos distintos. Confirmar el
 * "Grupo A" del correo antes de asumir.
 */

/** POST /recruiting/applicants — sólo obligatorios: first_name, surname */
export interface BukApplicantInput {
  first_name: string;
  surname: string;
  second_surname?: string;
  email?: string;
  phone?: string;
  address?: string;
  gender?: "M" | "F";
  birthday?: string;
  university?: string;
  academic_degree?: string;
  experience_years?: number;
  linkedin_url?: string;
  cv_url?: { cv_url: string };
  document_number?: string;
  document_type?: string;
  studies_level?: string;
  location_id?: string;
  custom_attributes?: Record<string, string>;
}

/** POST /recruiting/applications — obligatorios: applicant_id, selection_process_id */
export interface BukApplicationInput {
  applicant_id: string;
  selection_process_id: number;
  process_stage_id?: string;
  referrer?: string;
  integration_url?: string;
  application_date?: string;
  salary_expectation?: number;
  custom_attributes?: Record<string, string>;
}

export interface BukApplicant {
  id: number | string;
  first_name?: string;
  surname?: string;
  email?: string;
}

export interface BukApplication {
  id: number | string;
  selection_process_id?: number;
  process_stage?: { id: number; name: string };
  application_date?: string;
  applicant?: { id?: number | string };
}

export interface BukError {
  errors: string[];
}
