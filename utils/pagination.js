exports.buildPaginationResponse = ({ totalDocs, totalPages, page, limit }) => {
  return {
    totalItems: totalDocs,
    totalPages,
    currentPage: page,
    pageSize: limit
  };
};
