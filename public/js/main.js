document.addEventListener("DOMContentLoaded", () => {
    const sidebar = document.querySelector("#sidebar");
    const sidebarToggle =
        document.querySelector("#sidebarToggle");

    if (sidebar && sidebarToggle) {
        sidebarToggle.addEventListener("click", () => {
            sidebar.classList.toggle("open");
        });

        document.addEventListener("click", (event) => {
            const screenIsMobile =
                window.innerWidth <= 820;

            if (!screenIsMobile) {
                return;
            }

            const clickedInsideSidebar =
                sidebar.contains(event.target);

            const clickedToggle =
                sidebarToggle.contains(event.target);

            if (
                !clickedInsideSidebar &&
                !clickedToggle
            ) {
                sidebar.classList.remove("open");
            }
        });
    }

    const statusButtons = document.querySelectorAll(
        "[data-confirm-status]"
    );

    statusButtons.forEach((button) => {
        button.addEventListener("click", (event) => {
            const userName =
                button.dataset.userName;

            const currentStatus =
                Number(button.dataset.currentStatus);

            const action =
                currentStatus === 1
                    ? "deactivate"
                    : "activate";

            const confirmed = window.confirm(
                `Are you sure you want to ${action} ${userName}?`
            );

            if (!confirmed) {
                event.preventDefault();
            }
        });
    });
    const roleDeleteButtons = document.querySelectorAll(
    "[data-confirm-role-delete]"
);

roleDeleteButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
        const roleName = button.dataset.roleName;
        const userCount = Number(button.dataset.userCount);

        if (userCount > 0) {
            window.alert(
                `"${roleName}" cannot be deleted because ` +
                `${userCount} user${userCount === 1 ? " is" : "s are"} ` +
                "currently assigned to it."
            );

            event.preventDefault();
            return;
        }

        const confirmed = window.confirm(
            `Are you sure you want to delete the "${roleName}" role?`
        );

        if (!confirmed) {
            event.preventDefault();
        }
    });
});

const groupDeleteButtons = document.querySelectorAll(
    "[data-confirm-group-delete]"
);

groupDeleteButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
        const groupName =
            button.dataset.groupName;

        const memberCount = Number(
            button.dataset.memberCount
        );

        if (memberCount > 0) {
            window.alert(
                `"${groupName}" cannot be deleted because ` +
                `it contains ${memberCount} ` +
                `${memberCount === 1 ? "member" : "members"}. ` +
                "Remove its members first."
            );

            event.preventDefault();
            return;
        }

        const confirmed = window.confirm(
            `Are you sure you want to delete "${groupName}"?`
        );

        if (!confirmed) {
            event.preventDefault();
        }
    });
});

const workspaceDeleteButtons =
    document.querySelectorAll(
        "[data-confirm-workspace-delete]"
    );

workspaceDeleteButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
        const workspaceName =
            button.dataset.workspaceName;

        const taskCount = Number(
            button.dataset.taskCount
        );

        if (taskCount > 0) {
            window.alert(
                `"${workspaceName}" cannot be deleted because ` +
                `it contains ${taskCount} ` +
                `${taskCount === 1 ? "task" : "tasks"}.`
            );

            event.preventDefault();
            return;
        }

        const confirmed = window.confirm(
            `Are you sure you want to delete "${workspaceName}"?`
        );

        if (!confirmed) {
            event.preventDefault();
        }
    });
});

const taskDeleteButtons = document.querySelectorAll(
    "[data-confirm-task-delete]"
);

taskDeleteButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
        const taskTitle =
            button.dataset.taskTitle;

        const submissionCount = Number(
            button.dataset.submissionCount
        );

        if (submissionCount > 0) {
            window.alert(
                `"${taskTitle}" cannot be deleted because ` +
                `it contains ${submissionCount} ` +
                `${submissionCount === 1
                    ? "submission"
                    : "submissions"}.`
            );

            event.preventDefault();
            return;
        }

        const confirmed = window.confirm(
            `Are you sure you want to delete "${taskTitle}"?`
        );

        if (!confirmed) {
            event.preventDefault();
        }
    });
});

const submissionDeleteButtons =
    document.querySelectorAll(
        "[data-confirm-submission-delete]"
    );

submissionDeleteButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
        const taskTitle =
            button.dataset.taskTitle ||
            "this task";

        const submitterName =
            button.dataset.submitterName ||
            "this user";

        const confirmed = window.confirm(
            `Delete the submission from ${submitterName} ` +
            `for "${taskTitle}"?\n\n` +
            "This action cannot be undone."
        );

        if (!confirmed) {
            event.preventDefault();
        }
    });
});

});