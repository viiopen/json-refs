  angular.module('ngJsonRefs', [])
  .factory('JsonRefs', [

    function JsonRefsFactory () {
      return global.JsonRefs;
    }

  ]);

}).call(this);