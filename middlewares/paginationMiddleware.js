// middleware/pagination.js
const pagination = (req, res, next) => {
  try {
    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 10;
    let skip = (page - 1) * limit;

    req.pagination = {
      page,
      limit,
      skip,
      currentPage: page,
    };

    next(); 
  } catch (error) {
    next(error);
  }
};

export { pagination };
