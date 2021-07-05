const helpers = require('../_helpers')

const multer = require('multer')
const upload = multer({ dest: 'temp/' })





module.exports = (app, passport) => {

  const authenticated = (req, res, next) => {
    if (helpers.ensureAuthenticated(req)) {
      return next()
    }
    res.redirect('/signin')
  }
  const authenticatedAdmin = (req, res, next) => {
    if (helpers.ensureAuthenticated(req)) {
      if (helpers.getUser(req).isAdmin) { return next() }
      res.redirect('/signin')
    }
  }



  app.get('/', (req, res) => res.send('Hello!'))


}