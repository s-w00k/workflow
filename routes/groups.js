const express = require("express");
const database = require("../database/database");
const {
    requireRole,
    requireRoles
} = require("../middleware/auth");

const router = express.Router();

const organizationId = 1;
const temporaryCreatorId = 1;

/*
|--------------------------------------------------------------------------
| Promise-based database helpers
|--------------------------------------------------------------------------
*/

function getDatabase(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        database.get(sql, parameters, (error, row) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(row);
        });
    });
}

function allDatabase(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        database.all(sql, parameters, (error, rows) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(rows);
        });
    });
}

function runDatabase(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        database.run(sql, parameters, function (error) {
            if (error) {
                reject(error);
                return;
            }

            resolve({
                lastID: this.lastID,
                changes: this.changes
            });
        });
    });
}

/*
|--------------------------------------------------------------------------
| General helpers
|--------------------------------------------------------------------------
*/

function normalizeMemberIds(memberIds) {
    if (!memberIds) {
        return [];
    }

    const values = Array.isArray(memberIds)
        ? memberIds
        : [memberIds];

    return values
        .map((value) => Number(value))
        .filter(
            (value) =>
                Number.isInteger(value) &&
                value > 0
        );
}

async function getOrganizationUsers() {
    const sql = `
        SELECT
            user_id,
            full_name,
            email_address,
            is_active
        FROM users
        WHERE organization_id = ?
        ORDER BY
            is_active DESC,
            full_name ASC
    `;

    return allDatabase(sql, [organizationId]);
}

async function getGroupById(groupId) {
    const sql = `
        SELECT
            group_id,
            organization_id,
            group_name,
            group_type,
            group_description,
            created_by,
            created_at
        FROM groups
        WHERE group_id = ?
          AND organization_id = ?
    `;

    return getDatabase(sql, [
        groupId,
        organizationId
    ]);
}

async function getGroupMemberIds(groupId) {
    const sql = `
        SELECT user_id
        FROM group_members
        WHERE group_id = ?
    `;

    const members = await allDatabase(sql, [groupId]);

    return members.map((member) => member.user_id);
}

async function getGroupMemberCount(groupId) {
    const sql = `
        SELECT COUNT(*) AS member_count
        FROM group_members
        WHERE group_id = ?
    `;

    const result = await getDatabase(sql, [groupId]);

    return result.member_count;
}

async function validateMemberIds(memberIds) {
    if (memberIds.length === 0) {
        return true;
    }

    const placeholders = memberIds
        .map(() => "?")
        .join(", ");

    const sql = `
        SELECT COUNT(*) AS valid_count
        FROM users
        WHERE organization_id = ?
          AND user_id IN (${placeholders})
    `;

    const result = await getDatabase(sql, [
        organizationId,
        ...memberIds
    ]);

    return result.valid_count === memberIds.length;
}

/*
|--------------------------------------------------------------------------
| List groups
|--------------------------------------------------------------------------
*/

router.get("/", requireRoles([
        "Administrator",
        "Manager"
    ]), async (request, response, next) => {
    try {
        const sql = `
            SELECT
                groups.group_id,
                groups.group_name,
                groups.group_type,
                groups.group_description,
                groups.created_at,
                creator.full_name AS creator_name,
                COUNT(group_members.user_id) AS member_count
            FROM groups
            LEFT JOIN users AS creator
                ON groups.created_by = creator.user_id
            LEFT JOIN group_members
                ON groups.group_id = group_members.group_id
            WHERE groups.organization_id = ?
            GROUP BY
                groups.group_id,
                groups.group_name,
                groups.group_type,
                groups.group_description,
                groups.created_at,
                creator.full_name
            ORDER BY groups.group_name ASC
        `;

        const groups = await allDatabase(sql, [
            organizationId
        ]);

        response.render("groups/index", {
            pageTitle: "Groups",
            currentPage: "groups",
            groups,
            successMessage:
                request.query.success || null,
            errorMessage:
                request.query.error || null
        });
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Display add-group form
|--------------------------------------------------------------------------
*/

router.get("/add", requireRole("Administrator"), async (
    request,
    response,
    next
) => {
    try {
        const users = await getOrganizationUsers();

        response.render("groups/add", {
            pageTitle: "Add Group",
            currentPage: "groups",
            users,
            formData: {
                group_name: "",
                group_type: "",
                group_description: "",
                member_ids: []
            },
            errorMessage: null
        });
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Create group
|--------------------------------------------------------------------------
*/

router.post("/add", requireRole("Administrator"), async (
    request,
    response,
    next
) => {
    const groupName =
        request.body.group_name?.trim();

    const groupType =
        request.body.group_type?.trim() || null;

    const groupDescription =
        request.body.group_description?.trim() || null;

    const memberIds = normalizeMemberIds(
        request.body.member_ids
    );

    const formData = {
        group_name: groupName || "",
        group_type: groupType || "",
        group_description: groupDescription || "",
        member_ids: memberIds
    };

    try {
        const users = await getOrganizationUsers();

        if (!groupName) {
            response.status(400).render("groups/add", {
                pageTitle: "Add Group",
                currentPage: "groups",
                users,
                formData,
                errorMessage:
                    "Group name is required."
            });

            return;
        }

        const membersAreValid =
            await validateMemberIds(memberIds);

        if (!membersAreValid) {
            response.status(400).render("groups/add", {
                pageTitle: "Add Group",
                currentPage: "groups",
                users,
                formData,
                errorMessage:
                    "One or more selected users are invalid."
            });

            return;
        }

        await runDatabase("BEGIN TRANSACTION");

        try {
            const groupResult = await runDatabase(
                `
                    INSERT INTO groups (
                        organization_id,
                        group_name,
                        group_type,
                        group_description,
                        created_by
                    )
                    VALUES (?, ?, ?, ?, ?)
                `,
                [
                    organizationId,
                    groupName,
                    groupType,
                    groupDescription,
                    temporaryCreatorId
                ]
            );

            for (const memberId of memberIds) {
                await runDatabase(
                    `
                        INSERT INTO group_members (
                            group_id,
                            user_id
                        )
                        VALUES (?, ?)
                    `,
                    [
                        groupResult.lastID,
                        memberId
                    ]
                );
            }

            await runDatabase("COMMIT");

            response.redirect(
                "/groups?success=Group created successfully."
            );
        } catch (error) {
            await runDatabase("ROLLBACK");
            throw error;
        }
    } catch (error) {
        if (
            error.message.includes(
                "UNIQUE constraint failed"
            )
        ) {
            const users = await getOrganizationUsers();

            response.status(409).render("groups/add", {
                pageTitle: "Add Group",
                currentPage: "groups",
                users,
                formData,
                errorMessage:
                    "A group with this name already exists."
            });

            return;
        }

        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Display edit-group form
|--------------------------------------------------------------------------
*/

router.get("/edit/:id", requireRole("Administrator"), async (
    request,
    response,
    next
) => {
    const groupId = Number(request.params.id);

    if (
        !Number.isInteger(groupId) ||
        groupId <= 0
    ) {
        response.status(400).send(
            "Invalid group ID."
        );

        return;
    }

    try {
        const group = await getGroupById(groupId);

        if (!group) {
            response.status(404).send(
                "Group not found."
            );

            return;
        }

        const users = await getOrganizationUsers();
        const memberIds =
            await getGroupMemberIds(groupId);

        response.render("groups/edit", {
            pageTitle: "Edit Group",
            currentPage: "groups",
            users,
            group: {
                ...group,
                member_ids: memberIds
            },
            errorMessage: null
        });
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Update group
|--------------------------------------------------------------------------
*/

router.post("/edit/:id", requireRole("Administrator"), async (
    request,
    response,
    next
) => {
    const groupId = Number(request.params.id);

    if (
        !Number.isInteger(groupId) ||
        groupId <= 0
    ) {
        response.status(400).send(
            "Invalid group ID."
        );

        return;
    }

    const groupName =
        request.body.group_name?.trim();

    const groupType =
        request.body.group_type?.trim() || null;

    const groupDescription =
        request.body.group_description?.trim() || null;

    const memberIds = normalizeMemberIds(
        request.body.member_ids
    );

    try {
        const existingGroup =
            await getGroupById(groupId);

        if (!existingGroup) {
            response.status(404).send(
                "Group not found."
            );

            return;
        }

        const users = await getOrganizationUsers();

        const group = {
            ...existingGroup,
            group_name: groupName || "",
            group_type: groupType || "",
            group_description:
                groupDescription || "",
            member_ids: memberIds
        };

        if (!groupName) {
            response.status(400).render(
                "groups/edit",
                {
                    pageTitle: "Edit Group",
                    currentPage: "groups",
                    users,
                    group,
                    errorMessage:
                        "Group name is required."
                }
            );

            return;
        }

        const membersAreValid =
            await validateMemberIds(memberIds);

        if (!membersAreValid) {
            response.status(400).render(
                "groups/edit",
                {
                    pageTitle: "Edit Group",
                    currentPage: "groups",
                    users,
                    group,
                    errorMessage:
                        "One or more selected users are invalid."
                }
            );

            return;
        }

        await runDatabase("BEGIN TRANSACTION");

        try {
            await runDatabase(
                `
                    UPDATE groups
                    SET
                        group_name = ?,
                        group_type = ?,
                        group_description = ?
                    WHERE group_id = ?
                      AND organization_id = ?
                `,
                [
                    groupName,
                    groupType,
                    groupDescription,
                    groupId,
                    organizationId
                ]
            );

            await runDatabase(
                `
                    DELETE FROM group_members
                    WHERE group_id = ?
                `,
                [groupId]
            );

            for (const memberId of memberIds) {
                await runDatabase(
                    `
                        INSERT INTO group_members (
                            group_id,
                            user_id
                        )
                        VALUES (?, ?)
                    `,
                    [
                        groupId,
                        memberId
                    ]
                );
            }

            await runDatabase("COMMIT");

            response.redirect(
                "/groups?success=Group updated successfully."
            );
        } catch (error) {
            await runDatabase("ROLLBACK");
            throw error;
        }
    } catch (error) {
        if (
            error.message.includes(
                "UNIQUE constraint failed"
            )
        ) {
            const users =
                await getOrganizationUsers();

            response.status(409).render(
                "groups/edit",
                {
                    pageTitle: "Edit Group",
                    currentPage: "groups",
                    users,
                    group: {
                        group_id: groupId,
                        group_name: groupName || "",
                        group_type: groupType || "",
                        group_description:
                            groupDescription || "",
                        member_ids: memberIds
                    },
                    errorMessage:
                        "Another group already uses this name."
                }
            );

            return;
        }

        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Delete empty group
|--------------------------------------------------------------------------
*/

router.post("/:id/delete", requireRole("Administrator"), async (
    request,
    response,
    next
) => {
    const groupId = Number(request.params.id);

    if (
        !Number.isInteger(groupId) ||
        groupId <= 0
    ) {
        response.status(400).send(
            "Invalid group ID."
        );

        return;
    }

    try {
        const group = await getGroupById(groupId);

        if (!group) {
            response.status(404).send(
                "Group not found."
            );

            return;
        }

        const memberCount =
            await getGroupMemberCount(groupId);

        if (memberCount > 0) {
            const message =
                `Cannot delete "${group.group_name}" ` +
                `because it contains ${memberCount} ` +
                `${memberCount === 1 ? "member" : "members"}.`;

            response.redirect(
                `/groups?error=${encodeURIComponent(message)}`
            );

            return;
        }

        await runDatabase(
            `
                DELETE FROM groups
                WHERE group_id = ?
                  AND organization_id = ?
            `,
            [
                groupId,
                organizationId
            ]
        );

        response.redirect(
            "/groups?success=Group deleted successfully."
        );
    } catch (error) {
        next(error);
    }
});

module.exports = router;