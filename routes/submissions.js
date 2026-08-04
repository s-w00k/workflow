const express = require("express");
const database = require("../database/database");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Temporary organization ID
|--------------------------------------------------------------------------
|
| Replace this later with:
|
| request.session.user.organization_id
|
*/

const organizationId = 1;

/*
|--------------------------------------------------------------------------
| Database helpers
|--------------------------------------------------------------------------
*/

function getDatabase(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        database.get(
            sql,
            parameters,
            (error, row) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(row);
            }
        );
    });
}

function allDatabase(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        database.all(
            sql,
            parameters,
            (error, rows) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(rows);
            }
        );
    });
}

function runDatabase(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        database.run(
            sql,
            parameters,
            function (error) {
                if (error) {
                    reject(error);
                    return;
                }

                resolve({
                    lastID: this.lastID,
                    changes: this.changes
                });
            }
        );
    });
}

/*
|--------------------------------------------------------------------------
| General helpers
|--------------------------------------------------------------------------
*/

function normalizeOptionalText(value) {
    if (typeof value !== "string") {
        return null;
    }

    return value.trim() || null;
}

function normalizeSubmissionStatus(status) {
    const allowedStatuses = [
        "Draft",
        "Submitted",
        "Withdrawn"
    ];

    return allowedStatuses.includes(status)
        ? status
        : "Submitted";
}

function parsePositiveInteger(value) {
    const number = Number(value);

    if (
        !Number.isInteger(number) ||
        number <= 0
    ) {
        return null;
    }

    return number;
}

function submissionHasContent({
    writtenResponse,
    filePath,
    externalLink
}) {
    return Boolean(
        writtenResponse ||
        filePath ||
        externalLink
    );
}

/*
|--------------------------------------------------------------------------
| Shared database queries
|--------------------------------------------------------------------------
*/

async function getOrganizationTasks() {
    return allDatabase(
        `
            SELECT
                tasks.task_id,
                tasks.task_title,
                tasks.task_status,
                tasks.submission_required,
                tasks.due_date,
                workspaces.workspace_name
            FROM tasks
            INNER JOIN workspaces
                ON tasks.workspace_id =
                   workspaces.workspace_id
            WHERE workspaces.organization_id = ?
              AND tasks.submission_required = 1
            ORDER BY
                workspaces.workspace_name ASC,
                tasks.task_title ASC
        `,
        [organizationId]
    );
}

async function getOrganizationUsers() {
    return allDatabase(
        `
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
        `,
        [organizationId]
    );
}

async function getSubmissionById(
    submissionId
) {
    return getDatabase(
        `
            SELECT
                submissions.submission_id,
                submissions.task_id,
                submissions.submitted_by,
                submissions.written_response,
                submissions.file_path,
                submissions.external_link,
                submissions.submission_status,
                submissions.version_number,
                submissions.submitted_at,

                tasks.task_title,
                tasks.task_description,
                tasks.task_status,
                tasks.due_date,
                tasks.maximum_score,

                workspaces.workspace_name,

                users.full_name
                    AS submitted_by_name,

                users.email_address
                    AS submitted_by_email

            FROM submissions

            INNER JOIN tasks
                ON submissions.task_id =
                   tasks.task_id

            INNER JOIN workspaces
                ON tasks.workspace_id =
                   workspaces.workspace_id

            INNER JOIN users
                ON submissions.submitted_by =
                   users.user_id

            WHERE submissions.submission_id = ?
              AND workspaces.organization_id = ?
        `,
        [
            submissionId,
            organizationId
        ]
    );
}

async function taskBelongsToOrganization(
    taskId
) {
    const task = await getDatabase(
        `
            SELECT
                tasks.task_id,
                tasks.submission_required
            FROM tasks

            INNER JOIN workspaces
                ON tasks.workspace_id =
                   workspaces.workspace_id

            WHERE tasks.task_id = ?
              AND workspaces.organization_id = ?
        `,
        [
            taskId,
            organizationId
        ]
    );

    return task || null;
}

async function userBelongsToOrganization(
    userId
) {
    const user = await getDatabase(
        `
            SELECT user_id
            FROM users
            WHERE user_id = ?
              AND organization_id = ?
        `,
        [
            userId,
            organizationId
        ]
    );

    return Boolean(user);
}

async function userIsAssignedToTask(
    taskId,
    userId
) {
    const assignment = await getDatabase(
        `
            SELECT
                task_assignees.task_id,
                task_assignees.user_id

            FROM task_assignees

            INNER JOIN tasks
                ON task_assignees.task_id =
                   tasks.task_id

            INNER JOIN workspaces
                ON tasks.workspace_id =
                   workspaces.workspace_id

            WHERE task_assignees.task_id = ?
              AND task_assignees.user_id = ?
              AND workspaces.organization_id = ?
        `,
        [
            taskId,
            userId,
            organizationId
        ]
    );

    return Boolean(assignment);
}

async function getNextVersionNumber(
    taskId,
    submittedBy
) {
    const result = await getDatabase(
        `
            SELECT
                COALESCE(
                    MAX(version_number),
                    0
                ) + 1 AS next_version

            FROM submissions

            WHERE task_id = ?
              AND submitted_by = ?
        `,
        [
            taskId,
            submittedBy
        ]
    );

    return result.next_version;
}

/*
|--------------------------------------------------------------------------
| Form helpers
|--------------------------------------------------------------------------
*/

function buildAddFormData(
    requestBody = {},
    submittedBy
) {
    return {
        task_id:
            parsePositiveInteger(
                requestBody.task_id
            ) || "",

        submitted_by:
            submittedBy || "",

        written_response:
            requestBody.written_response || "",

        file_path:
            requestBody.file_path || "",

        external_link:
            requestBody.external_link || "",

        submission_status:
            normalizeSubmissionStatus(
                requestBody.submission_status
            )
    };
}

async function renderAddError(
    response,
    tasks,
    users,
    formData,
    errorMessage
) {
    return response.status(400).render(
        "submissions/add",
        {
            pageTitle: "Add Submission",
            currentPage: "submissions",
            tasks,
            users,
            formData,
            errorMessage
        }
    );
}

async function renderEditError(
    response,
    tasks,
    users,
    submission,
    errorMessage
) {
    return response.status(400).render(
        "submissions/edit",
        {
            pageTitle: "Edit Submission",
            currentPage: "submissions",
            tasks,
            users,
            submission,
            errorMessage
        }
    );
}

/*
|--------------------------------------------------------------------------
| List submissions
|--------------------------------------------------------------------------
|
| All authenticated users can access this route.
|
| Later, this query can be changed to respect the task's submission
| visibility setting.
|
*/

router.get("/", async (
    request,
    response,
    next
) => {
    try {
        const currentUserId =
            request.session.user.user_id;

        const currentRole =
            request.session.user.role_name;

        const isManagement = [
            "Administrator",
            "Manager"
        ].includes(currentRole);

        let sql;
        let parameters;

        if (isManagement) {
            sql = `
                SELECT
                    submissions.submission_id,
                    submissions.submission_status,
                    submissions.version_number,
                    submissions.submitted_at,

                    tasks.task_id,
                    tasks.task_title,
                    tasks.submission_visibility,

                    workspaces.workspace_name,

                    users.user_id,
                    users.full_name
                        AS submitted_by_name

                FROM submissions

                INNER JOIN tasks
                    ON submissions.task_id =
                       tasks.task_id

                INNER JOIN workspaces
                    ON tasks.workspace_id =
                       workspaces.workspace_id

                INNER JOIN users
                    ON submissions.submitted_by =
                       users.user_id

                WHERE workspaces.organization_id = ?

                ORDER BY
                    submissions.submitted_at DESC,
                    submissions.submission_id DESC
            `;

            parameters = [
                organizationId
            ];
        } else {
            sql = `
                SELECT
                    submissions.submission_id,
                    submissions.submission_status,
                    submissions.version_number,
                    submissions.submitted_at,

                    tasks.task_id,
                    tasks.task_title,
                    tasks.submission_visibility,

                    workspaces.workspace_name,

                    users.user_id,
                    users.full_name
                        AS submitted_by_name

                FROM submissions

                INNER JOIN tasks
                    ON submissions.task_id =
                       tasks.task_id

                INNER JOIN workspaces
                    ON tasks.workspace_id =
                       workspaces.workspace_id

                INNER JOIN users
                    ON submissions.submitted_by =
                       users.user_id

                INNER JOIN task_assignees
                    ON tasks.task_id =
                       task_assignees.task_id

                WHERE workspaces.organization_id = ?

                  AND task_assignees.user_id = ?

                  AND (
                      tasks.submission_visibility =
                          'Shared'

                      OR submissions.submitted_by = ?
                  )

                ORDER BY
                    submissions.submitted_at DESC,
                    submissions.submission_id DESC
            `;

            parameters = [
                organizationId,
                currentUserId,
                currentUserId
            ];
        }

        const submissions =
            await allDatabase(
                sql,
                parameters
            );

        response.render(
            "submissions/index",
            {
                pageTitle: "Submissions",
                currentPage: "submissions",
                submissions,

                successMessage:
                    request.query.success ||
                    null,

                errorMessage:
                    request.query.error ||
                    null
            }
        );
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Display add-submission form
|--------------------------------------------------------------------------
|
| All authenticated users can create submissions.
|
| The logged-in user is automatically used as the submitter.
|
*/

router.get("/add", async (
    request,
    response,
    next
) => {
    try {
        const submittedBy =
            request.session.user.user_id;

        const tasks =
            await getOrganizationTasks();

        const users =
            await getOrganizationUsers();

        response.render(
            "submissions/add",
            {
                pageTitle: "Add Submission",
                currentPage: "submissions",
                tasks,
                users,

                formData: {
                    task_id:
                        parsePositiveInteger(
                            request.query.task_id
                        ) || "",

                    submitted_by:
                        submittedBy,

                    written_response: "",
                    file_path: "",
                    external_link: "",

                    submission_status:
                        "Submitted"
                },

                errorMessage: null
            }
        );
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Create submission
|--------------------------------------------------------------------------
|
| All authenticated users can create submissions.
|
| submitted_by is taken from the session. It is not accepted from the
| browser form because users must not submit under another user's identity.
|
*/

router.post("/add", async (
    request,
    response,
    next
) => {
    const taskId =
        parsePositiveInteger(
            request.body.task_id
        );

    const submittedBy =
        request.session.user.user_id;

    const writtenResponse =
        normalizeOptionalText(
            request.body.written_response
        );

    const filePath =
        normalizeOptionalText(
            request.body.file_path
        );

    const externalLink =
        normalizeOptionalText(
            request.body.external_link
        );

    const submissionStatus =
        normalizeSubmissionStatus(
            request.body.submission_status
        );

    const formData =
        buildAddFormData(
            request.body,
            submittedBy
        );

    try {
        const tasks =
            await getOrganizationTasks();

        const users =
            await getOrganizationUsers();

        if (!taskId) {
            return renderAddError(
                response,
                tasks,
                users,
                formData,
                "A task is required."
            );
        }

        if (!submittedBy) {
            return renderAddError(
                response,
                tasks,
                users,
                formData,
                "The logged-in user could not be identified."
            );
        }

        const task =
            await taskBelongsToOrganization(
                taskId
            );

        if (!task) {
            return renderAddError(
                response,
                tasks,
                users,
                formData,
                "The selected task is invalid."
            );
        }

        if (
            task.submission_required !== 1
        ) {
            return renderAddError(
                response,
                tasks,
                users,
                formData,
                "The selected task does not require a submission."
            );
        }

        const userIsValid =
            await userBelongsToOrganization(
                submittedBy
            );

        if (!userIsValid) {
            return renderAddError(
                response,
                tasks,
                users,
                formData,
                "The logged-in user does not belong to this organization."
            );
        }

        const userIsAssigned =
            await userIsAssignedToTask(
                taskId,
                submittedBy
            );

        if (!userIsAssigned) {
            return renderAddError(
                response,
                tasks,
                users,
                formData,
                "You are not assigned to this task."
            );
        }

        if (
            !submissionHasContent({
                writtenResponse,
                filePath,
                externalLink
            })
        ) {
            return renderAddError(
                response,
                tasks,
                users,
                formData,
                "Enter a written response, file path, or external link."
            );
        }

        const versionNumber =
            await getNextVersionNumber(
                taskId,
                submittedBy
            );

        const result =
            await runDatabase(
                `
                    INSERT INTO submissions (
                        task_id,
                        submitted_by,
                        written_response,
                        file_path,
                        external_link,
                        submission_status,
                        version_number
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    taskId,
                    submittedBy,
                    writtenResponse,
                    filePath,
                    externalLink,
                    submissionStatus,
                    versionNumber
                ]
            );

        response.redirect(
            `/submissions/${result.lastID}`
        );
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Display edit-submission form
|--------------------------------------------------------------------------
|
| Only Administrators can edit existing submissions.
|
*/

router.get(
    "/edit/:id",
    requireRole("Administrator"),
    async (
        request,
        response,
        next
    ) => {
        const submissionId =
            parsePositiveInteger(
                request.params.id
            );

        if (!submissionId) {
            response.status(400).send(
                "Invalid submission ID."
            );

            return;
        }

        try {
            const submission =
                await getSubmissionById(
                    submissionId
                );

            if (!submission) {
                response.status(404).send(
                    "Submission not found."
                );

                return;
            }

            const tasks =
                await getOrganizationTasks();

            const users =
                await getOrganizationUsers();

            response.render(
                "submissions/edit",
                {
                    pageTitle:
                        "Edit Submission",

                    currentPage:
                        "submissions",

                    tasks,
                    users,

                    submission: {
                        ...submission,

                        written_response:
                            submission
                                .written_response ||
                            "",

                        file_path:
                            submission.file_path ||
                            "",

                        external_link:
                            submission
                                .external_link ||
                            ""
                    },

                    errorMessage: null
                }
            );
        } catch (error) {
            next(error);
        }
    }
);

/*
|--------------------------------------------------------------------------
| Update submission
|--------------------------------------------------------------------------
|
| Only Administrators can update existing submissions.
|
| The original submitted_by value is preserved. Editing a submission does
| not transfer ownership to the Administrator.
|
*/

router.post(
    "/edit/:id",
    requireRole("Administrator"),
    async (
        request,
        response,
        next
    ) => {
        const submissionId =
            parsePositiveInteger(
                request.params.id
            );

        if (!submissionId) {
            response.status(400).send(
                "Invalid submission ID."
            );

            return;
        }

        const taskId =
            parsePositiveInteger(
                request.body.task_id
            );

        const writtenResponse =
            normalizeOptionalText(
                request.body.written_response
            );

        const filePath =
            normalizeOptionalText(
                request.body.file_path
            );

        const externalLink =
            normalizeOptionalText(
                request.body.external_link
            );

        const submissionStatus =
            normalizeSubmissionStatus(
                request.body
                    .submission_status
            );

        try {
            const existingSubmission =
                await getSubmissionById(
                    submissionId
                );

            if (!existingSubmission) {
                response.status(404).send(
                    "Submission not found."
                );

                return;
            }

            /*
             * Preserve the original submitter.
             */
            const submittedBy =
                existingSubmission
                    .submitted_by;

            const tasks =
                await getOrganizationTasks();

            const users =
                await getOrganizationUsers();

            const submission = {
                ...existingSubmission,

                task_id:
                    taskId || "",

                submitted_by:
                    submittedBy,

                written_response:
                    writtenResponse || "",

                file_path:
                    filePath || "",

                external_link:
                    externalLink || "",

                submission_status:
                    submissionStatus
            };

            if (!taskId) {
                return renderEditError(
                    response,
                    tasks,
                    users,
                    submission,
                    "A task is required."
                );
            }

            if (!submittedBy) {
                return renderEditError(
                    response,
                    tasks,
                    users,
                    submission,
                    "The original submitting user could not be identified."
                );
            }

            const task =
                await taskBelongsToOrganization(
                    taskId
                );

            if (!task) {
                return renderEditError(
                    response,
                    tasks,
                    users,
                    submission,
                    "The selected task is invalid."
                );
            }

            if (
                task.submission_required !== 1
            ) {
                return renderEditError(
                    response,
                    tasks,
                    users,
                    submission,
                    "The selected task does not require a submission."
                );
            }

            const userIsValid =
                await userBelongsToOrganization(
                    submittedBy
                );

            if (!userIsValid) {
                return renderEditError(
                    response,
                    tasks,
                    users,
                    submission,
                    "The submitting user is invalid."
                );
            }

            const userIsAssigned =
                await userIsAssignedToTask(
                    taskId,
                    submittedBy
                );

            if (!userIsAssigned) {
                return renderEditError(
                    response,
                    tasks,
                    users,
                    submission,
                    "The submitting user is not assigned to this task."
                );
            }

            if (
                !submissionHasContent({
                    writtenResponse,
                    filePath,
                    externalLink
                })
            ) {
                return renderEditError(
                    response,
                    tasks,
                    users,
                    submission,
                    "Enter a written response, file path, or external link."
                );
            }

            /*
             * submitted_by is deliberately not updated.
             *
             * The original employee remains the owner of the submission.
             */
            const result =
                await runDatabase(
                    `
                        UPDATE submissions
                        SET
                            task_id = ?,
                            written_response = ?,
                            file_path = ?,
                            external_link = ?,
                            submission_status = ?

                        WHERE submission_id = ?

                          AND task_id IN (
                              SELECT
                                  tasks.task_id

                              FROM tasks

                              INNER JOIN workspaces
                                  ON tasks.workspace_id =
                                     workspaces.workspace_id

                              WHERE
                                  workspaces.organization_id = ?
                          )
                    `,
                    [
                        taskId,
                        writtenResponse,
                        filePath,
                        externalLink,
                        submissionStatus,
                        submissionId,
                        organizationId
                    ]
                );

            if (result.changes === 0) {
                response.status(404).send(
                    "Submission could not be updated."
                );

                return;
            }

            response.redirect(
                `/submissions/${submissionId}`
            );
        } catch (error) {
            next(error);
        }
    }
);

/*
|--------------------------------------------------------------------------
| Submission details
|--------------------------------------------------------------------------
|
| Administrator and Manager can view every submission.
|
| Members can view:
| - Their own submissions
| - Other employees' submissions only when the task is Shared
|   and the Member is assigned to that task
|
*/

router.get("/:id", async (
    request,
    response,
    next
) => {
    const submissionId =
        parsePositiveInteger(
            request.params.id
        );

    if (!submissionId) {
        response.status(400).send(
            "Invalid submission ID."
        );

        return;
    }

    try {
        const submission =
            await getSubmissionById(
                submissionId
            );

        if (!submission) {
            response.status(404).send(
                "Submission not found."
            );

            return;
        }

        const currentUserId =
            request.session.user.user_id;

        const currentRole =
            request.session.user.role_name;

        const isManagement = [
            "Administrator",
            "Manager"
        ].includes(currentRole);

        if (!isManagement) {
            const taskVisibility =
                await getDatabase(
                    `
                        SELECT
                            tasks.submission_visibility
                        FROM tasks

                        INNER JOIN workspaces
                            ON tasks.workspace_id =
                               workspaces.workspace_id

                        WHERE tasks.task_id = ?
                          AND workspaces.organization_id = ?
                    `,
                    [
                        submission.task_id,
                        organizationId
                    ]
                );

            if (!taskVisibility) {
                response.status(404).send(
                    "Task not found."
                );

                return;
            }

            const isOwnSubmission =
                submission.submitted_by ===
                currentUserId;

            const isAssigned =
                await userIsAssignedToTask(
                    submission.task_id,
                    currentUserId
                );

            const canViewSharedSubmission =
                taskVisibility
                    .submission_visibility ===
                    "Shared" &&
                isAssigned;

            if (
                !isOwnSubmission &&
                !canViewSharedSubmission
            ) {
                response.status(403).send(
                    "You do not have permission to view this submission."
                );

                return;
            }
        }

        response.render(
            "submissions/details",
            {
                pageTitle:
                    `Submission #${submission.submission_id}`,

                currentPage:
                    "submissions",

                submission
            }
        );
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Delete submission
|--------------------------------------------------------------------------
|
| Only Administrators can delete submissions.
|
*/

router.post(
    "/:id/delete",
    requireRole("Administrator"),
    async (
        request,
        response,
        next
    ) => {
        const submissionId =
            parsePositiveInteger(
                request.params.id
            );

        if (!submissionId) {
            response.status(400).send(
                "Invalid submission ID."
            );

            return;
        }

        try {
            const submission =
                await getSubmissionById(
                    submissionId
                );

            if (!submission) {
                response.status(404).send(
                    "Submission not found."
                );

                return;
            }

            const result =
                await runDatabase(
                    `
                        DELETE FROM submissions
                        WHERE submission_id = ?
                          AND task_id IN (
                              SELECT
                                  tasks.task_id

                              FROM tasks

                              INNER JOIN workspaces
                                  ON tasks.workspace_id =
                                     workspaces.workspace_id

                              WHERE
                                  workspaces.organization_id = ?
                          )
                    `,
                    [
                        submissionId,
                        organizationId
                    ]
                );

            if (result.changes === 0) {
                response.status(404).send(
                    "Submission could not be deleted."
                );

                return;
            }

            response.redirect(
                "/submissions?success=" +
                encodeURIComponent(
                    "Submission deleted successfully."
                )
            );
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;