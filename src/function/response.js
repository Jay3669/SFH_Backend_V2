const STATUS = {
    SUCCESS: "SUCCESS",
    CREATED: "CREATED",
    BAD_REQUEST: "BAD_REQUEST",
    CONFLICT: "CONFLICT",
    UNAUTHORIZED: "UNAUTHORIZED",
    FORBIDDEN: "FORBIDDEN",
    TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
    NOT_FOUND: "NOT_FOUND",
    INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
};

const createResponse = ({
    statusCode,
    status,
    message,
    data,
    errors,
    pagination,
}) => {
    const response = {
        statusCode,
        status,
        message,
    };

    if (data !== undefined) response.data = data;
    if (errors !== undefined) response.errors = errors;
    if (pagination !== undefined) response.pagination = pagination;

    return response;
};

export const OPERATION_SUCCESS = (message = "Success", data, pagination) =>
    createResponse({
        statusCode: 200,
        status: STATUS.SUCCESS,
        message,
        data,
        pagination,
    });

export const CREATED = (message = "Resource created successfully", data) =>
    createResponse({
        statusCode: 201,
        status: STATUS.CREATED,
        message,
        data,
    });

export const BAD_REQUEST = (message = "Bad request", errors) =>
    createResponse({
        statusCode: 400,
        status: STATUS.BAD_REQUEST,
        message,
        errors,
    });

export const CONFLICT = (message = "Resource conflict", errors) =>
    createResponse({
        statusCode: 409,
        status: STATUS.CONFLICT,
        message,
        errors,
    });

export const UNAUTHORIZED = (message = "Unauthorized", errors) =>
    createResponse({
        statusCode: 401,
        status: STATUS.UNAUTHORIZED,
        message,
        errors,
    });

export const FORBIDDEN = (message = "Forbidden", errors) =>
    createResponse({
        statusCode: 403,
        status: STATUS.FORBIDDEN,
        message,
        errors,
    });

export const TOO_MANY_REQUESTS = (message = "Too many requests") =>
    createResponse({
        statusCode: 429,
        status: STATUS.TOO_MANY_REQUESTS,
        message,
    });

export const NOT_FOUND = (message = "Resource not found", errors) =>
    createResponse({
        statusCode: 404,
        status: STATUS.NOT_FOUND,
        message,
        errors,
    });

export const INTERNAL_SERVER_ERROR = (message = "Something went wrong", errors) =>
    createResponse({
        statusCode: 500,
        status: STATUS.INTERNAL_SERVER_ERROR,
        message,
        errors,
    });