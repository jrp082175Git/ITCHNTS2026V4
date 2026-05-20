const registry = {
  T: require('./seconds-message'),
  R: require('./order-book-directory'),
  X: require('./order-book-directory-extension'),
  M: require('./combination-order-book-leg'),
  L: require('./tick-size-table'),
  S: require('./system-event'),
  O: require('./order-book-state'),
  A: require('./add-anonymous-order'),
  F: require('./add-attributed-order'),
  E: require('./order-executed'),
  C: require('./order-executed-with-price'),
  D: require('./order-delete'),
  P: require('./trade-message'),
  Z: require('./equilibrium-price'),
  G: require('./glimpse-snapshot'),
};

module.exports = registry;
