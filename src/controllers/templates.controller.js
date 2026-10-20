import { TemplatesService } from '../services/templates.service.js';
import { successResponse } from '../utils/response.js';

export class TemplatesController {
  /**
   * GET /api/document-types
   */
  static async getDocumentTypes(req, res, next) {
    try {
      const docTypes = await TemplatesService.getDocumentTypes();
      return successResponse(res, docTypes, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/templates
   */
  static async getTemplates(req, res, next) {
    try {
      const { documentType, clubId } = req.query;
      const templates = await TemplatesService.listTemplates({
        userId: req.user?.id,
        documentType,
        clubId,
      });
      return successResponse(res, templates, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/templates/:templateId
   */
  static async getTemplateById(req, res, next) {
    try {
      const template = await TemplatesService.getTemplateById(
        req.params.templateId,
        req.user?.id
      );
      return successResponse(res, template, 200);
    } catch (error) {
      next(error);
    }
  }
}
