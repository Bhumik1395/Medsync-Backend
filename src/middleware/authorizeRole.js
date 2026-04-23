export function authorizeRole(roles) {
  return (req, res, next) => {
    const userRole = req.user?.role;

    if (!userRole || !roles.includes(userRole)) {
      return res.status(403).json({
        error: "Forbidden"
      });
    }

    next();
  };
}

