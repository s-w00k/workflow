const bcrypt = require("bcrypt");
const database = require("../database/database");

const saltRounds = 12;

const users = [
    {
        emailAddress: "admin@example.com",
        password: "Admin123!"
    },
    {
        emailAddress: "manager@example.com",
        password: "Manager123!"
    },
    {
        emailAddress: "jamie@example.com",
        password: "Jamie123!"
    },
    {
        emailAddress: "taylor@example.com",
        password: "Taylor123!"
    }
];

function runDatabase(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        database.run(sql, parameters, function (error) {
            if (error) {
                reject(error);
                return;
            }

            resolve({
                changes: this.changes
            });
        });
    });
}

async function updatePasswords() {
    try {
        for (const user of users) {
            const passwordHash = await bcrypt.hash(
                user.password,
                saltRounds
            );

            const result = await runDatabase(
                `
                    UPDATE users
                    SET
                        password_hash = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE email_address = ?
                `,
                [
                    passwordHash,
                    user.emailAddress
                ]
            );

            if (result.changes === 0) {
                console.log(
                    `User not found: ${user.emailAddress}`
                );
            } else {
                console.log(
                    `Password updated: ${user.emailAddress}`
                );
            }
        }

        console.log(
            "All available user passwords were updated."
        );
    } catch (error) {
        console.error(
            "Password update failed:",
            error
        );

        process.exitCode = 1;
    } finally {
        database.close();
    }
}

updatePasswords();