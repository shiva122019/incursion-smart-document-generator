import { TemplatesRepository } from '../database/repositories/templates.repository.js';
import { AuthorizationService } from './authorizationService.js';
import { NotFoundError } from '../utils/errors.js';

export class TemplatesService {
  /**
   * Retrieves active document types catalog.
   */
  static async getDocumentTypes() {
    return TemplatesRepository.getDocumentTypes();
  }

  /**
   * Retrieves active published templates filtered by document type or club.
   */
  static async listTemplates({ userId, documentType = null, clubId = null }) {
    if (clubId) {
      await AuthorizationService.assertClubAccess({ userId, clubId });
    }

    return TemplatesRepository.listTemplates({
      documentTypeSlug: documentType,
      clubId,
    });
  }

  /**
   * Retrieves a template by ID, verifying club ownership if club-specific.
   */
  static async getTemplateById(templateId, userId) {
    const template = await TemplatesRepository.findTemplateById(templateId);
    if (!template) {
      throw new NotFoundError('Template not found');
    }

    if (template.club_id) {
      try {
        await AuthorizationService.assertClubAccess({
          userId,
          clubId: template.club_id,
        });
      } catch (err) {
        throw new NotFoundError('Template not found');
      }
    }

    return template;
  }
}
