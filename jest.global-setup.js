// Date boundaries are computed in the device's local time zone. Pin one so tests are deterministic.
module.exports = async () => {
  process.env.TZ = 'Asia/Tokyo';
};
