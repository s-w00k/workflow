function requireAuthentication(
    request,
    response,
    next
) {
    if (!request.session.user) {
        response.redirect("/login");
        return;
    }

    next();
}

function requireGuest(
    request,
    response,
    next
) {
    if (request.session.user) {
        response.redirect("/");
        return;
    }

    next();
}

function attachCurrentUser(
    request,
    response,
    next
) {
    response.locals.currentUser =
        request.session.user || null;

    next();
}

function requireRole(roleName) {
    return function (
        request,
        response,
        next
    ) {
        if (!request.session.user) {
            response.redirect("/login");
            return;
        }

        if (
            request.session.user.role_name !==
            roleName
        ) {
            response.status(403).send(
                "You do not have permission to access this page."
            );

            return;
        }

        next();
    };
}

function requireRoles(allowedRoles) {
    return function (
        request,
        response,
        next
    ) {
        if (!request.session.user) {
            response.redirect("/login");
            return;
        }

        const currentRole =
            request.session.user.role_name;

        if (!allowedRoles.includes(currentRole)) {
            response.status(403).send(
                "You do not have permission to access this page."
            );

            return;
        }

        next();
    };
}

module.exports = {
    requireAuthentication,
    requireGuest,
    attachCurrentUser,
    requireRole,
    requireRoles
};