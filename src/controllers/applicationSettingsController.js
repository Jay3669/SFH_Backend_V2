import { OPERATION_SUCCESS } from '../function/response.js';
import {
    getApplicationSettings,
    updateApplicationSettings,
} from '../services/applicationSettingsService.js';

export const readApplicationSettingsController = async (req, res, next) => {
    try {
        return res.status(200).json(OPERATION_SUCCESS(
            'Application settings loaded.',
            await getApplicationSettings(),
        ));
    } catch (error) {
        return next(error);
    }
};

export const updateApplicationSettingsController = async (req, res, next) => {
    try {
        return res.status(200).json(OPERATION_SUCCESS(
            'Application settings updated.',
            await updateApplicationSettings(req.body, req.user.id),
        ));
    } catch (error) {
        return next(error);
    }
};
