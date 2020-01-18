const User = require('../model/user.model');
const Pickreq = require('../model/pickreq.model');
const CronJob = require('cron').CronJob;

/*
  A Cron job to clean outdated request every 15 minute. 
*/
new CronJob('0 */15 * * * *', function () {
  console.log('fucking myself');
  const now = new Date();
  console.log(now);
}, null, true, 'America/New_York');

module.exports = router => {
  //middleware to search requester info
  router.param('username', (req, res, next, username) => {
    req.username = username;
    console.log('middleware get username:', req.username);
    /**
     * todo: if the user is updating,
     * then directly return next();
     */

    Pickreq.findOne({ username: username })
      .exec((err, doc) => {
        if (err) {
          return next(err);
        } else if (!doc) {
          req.currRequest = null;
          return next();
        } else {
          req.currRequest = doc;
          let volunteer = req.currRequest.volunteer;
          if (volunteer && volunteer.length) {
            // using lean() to return a simple POJO rather than Mongoose document obj
            User.findOne({ username: volunteer }).lean()
              .exec((err, volunteerInfo) => {
                if (err) {
                  req.currRequest = null;
                  return next(err);
                } else if (volunteerInfo) {
                  const { pwd, _id, ...data } = volunteerInfo;
                  req.volunteer = data;
                  return next();
                }
              });
          } else {
            return next();
          }
        }
      });
  });

  // middleware to get the requestId param
  router.param('requestId', (req, res, next, requestId) => {
    req.requestId = requestId;
    return next();
  });

  // middleware to get volunteer username
  router.param('volunteer', (req, res, next, volunteer) => {
    req.volunteer = volunteer;
    return next();
  })

  // get current user's request
  router.route('/user/:username')
    .get((req, res) => {
      console.log('getting current user\'s request info', req.currRequest)
      return res.json({
        code: 0,
        data: {
          request: req.currRequest,
          volunteer: req.volunteer
        }
      });
    })
    .put((req, res) => {
      if (req.body) {
        console.log(req.body)
        //if the user unpublished the request, then remove the volunteer
        if (!req.body.published) {
          req.body.volunteer = '';
        }
        Pickreq.findOneAndUpdate({ username: req.username }, req.body,
          { upsert: true, setDefaultsOnInsert: true, new: true }, (err, doc) => {
            if (err) {
              console.log(err.stack);
              return res.status(422).json({
                code: 1,
                msg: 'Failed to update/create request info'
              });
            } else {
              console.log('successfully update');
              return res.status(200).json({
                code: 0,
                msg: 'Successfully update!',
                data: {
                  request: doc
                }
              })
            }
          });
      }
    });

  router.route('/request/:requestId')
    .post((req, res) => {
      // A volunteer accept the request
      const id = req.requestId;
      Pickreq.update({ _id: id }, { volunteer: req.body.volunteer }, (err, doc) => {
        if (err) {
          return res.status(422).json({
            msg: 'Internal error happened when trying to accept this request!',
            err: err
          });
        } else {
          return res.status(200).json({
            msg: 'Accepted this request successfully!'
          })
        }
      })
    })
    .delete((req, res) => {
      // delete a request
      const id = req.requestId;
      console.log('delete', id);
      Pickreq.deleteOne({ _id: id }, err => {
        if (err) {
          return res.status(422).json({
            code: 1,
            msg: 'Error happened when deleting!'
          });
        }

        return res.status(200).json({
          code: 0,
          msg: 'Delete successully!'
        })
      })
    });

  // list all requests in the db
  router.route('/list')
    .get((req, res) => {
      Pickreq.find({})
        .exec((err, doc) => {
          if (err) {
            console.error(err);
            return res.status(422).json({
              msg: err
            });
          } else {
            const result = {
              reqList: []
            };

            if (!doc || doc.length === 0) {
              return res.status(200).json(result);
            } else {
              // search user information based on username
              // TODO: use Redis to save the user information (username -> UserInfo)
              const promiseList = [];
              let idx = 0;
              doc.forEach(item => {
                const username = item.username;
                // if already has a volunteer, then skip it
                if (item.volunteer !== '' || item.volunteer) {
                  return;
                }

                promiseList.push(
                  User.findOne({ username: username }).then(userInfo => {
                    const data = {
                      key: idx,
                      request: item,
                      user: {
                        firstName: userInfo.firstName,
                        lastName: userInfo.lastName,
                        email: userInfo.email,
                        phone: userInfo.phone,
                        wechatId: userInfo.wechatId,
                        gender: userInfo.gender,
                        displayName: userInfo.displayName
                      }
                    };

                    idx++;
                    result.reqList.push(data);
                  }).catch(err => { throw new Error(err) })
                );
              });


              // return all promises at once
              Promise.all(promiseList)
                .then(() => (res.json({ ...result, code: 0 })))
                .catch(err => {
                  console.error(err);
                  return res.status(422).send({ err: err.message });
                });
            }
          }
        });
    });

  router.route('/volunteer/:volunteer')
    .get((req, res) => {
      Pickreq.find({ volunteer: req.volunteer }).lean().exec((err, doc) => {
        console.log(doc);
        return res.status(200).json({
          msg: 'Get Accepted List Successfully',
          acceptedList: doc,
        })
      })
    })

  return router;
}