import types from 'config/types';
import removeFromArray from 'utils/removeFromArray';
import resolveRef from 'shared/resolveRef';
import Unresolved from 'shared/Unresolved';
import ExpressionResolver from 'virtualdom/items/shared/Resolvers/ExpressionResolver';

var ReferenceExpressionResolver = function ( mustache, template, callback ) {
	var resolver = this, ref, parentFragment, keypath;

	parentFragment = mustache.parentFragment;

	this.root = mustache.root;
	this.mustache = mustache;
	this.priority = mustache.priority;

	this.callback = callback;

	this.unresolved = [];
	this.members = [];
	this.indexRefMembers = [];
	this.keypathObservers = [];

	// Find base keypath
	resolveBase( this, mustache.root, template.r, parentFragment );

	// Find values for members, or mark them as unresolved
	template.m.forEach( function ( member, i ) {
		var ref;

		if ( typeof member === 'string' ) {
			resolver.members[i] = member;
		}

		// simple reference?
		else if ( member.t === types.REFERENCE ) {
			ref = member.n;
			handleIndexReference( resolver, ref, i, parentFragment.indexRefs ) ||
			handleReference( resolver, ref, i, parentFragment );
		}

		// Otherwise we have an expression in its own right
		else {
			handleExpression( resolver, member, i, parentFragment );
		}
	});

	this.ready = true;
	this.bubble(); // trigger initial resolution if possible
};

ReferenceExpressionResolver.prototype = {
	getKeypath: function () {
		return this.base + '.' + this.members.join( '.' );
	},

	bubble: function () {
		if ( !this.ready || this.unresolved.length ) {
			return;
		}
		this.callback( this.getKeypath() );
	},

	resolve: function ( index, keypath ) {
		var keypathObserver = new KeypathObserver( this.root, keypath, this.mustache.priority, this, index );
		this.keypathObservers.push( keypathObserver );

		this.bubble();
	},

	teardown: function () {
		var thing;

		while ( thing = this.unresolved.pop() ) {
			thing.teardown();
		}

		while ( thing = this.keypathObservers.pop() ) {
			thing.teardown();
		}
	},

	rebind: function ( indexRef, newIndex ) {
		var changed, i, member;

		if ( !indexRef || !this.indexRefMembers.length ) {
			return;
		}

		i = this.indexRefMembers.length;
		while ( i-- ) {
			member = this.indexRefMembers[i];
			if ( member.ref === indexRef ) {
				changed = true;
				this.members[ member.index ] = newIndex;
			}
		}

		if ( changed ) {
			this.bubble();
		}
	}
};

function handleIndexReference ( resolver, ref, i, indexRefs ) {
	var index;

	if ( indexRefs && ( index = indexRefs[ ref ] ) !== undefined ) {
		resolver.members[i] = index;

		// make a note of it, in case of rebindings
		resolver.indexRefMembers.push({
			ref: ref,
			index: i
		});

		return true;
	}
}

function handleReference ( resolver, ref, i, parentFragment ) {
	var ractive, keypath, keypathObserver, unresolved;

	ractive = resolver.root;

	// Can we resolve the reference immediately?
	if ( keypath = resolveRef( ractive, ref, parentFragment ) ) {
		keypathObserver = new KeypathObserver( ractive, keypath, parentFragment.priority, resolver, i );
		resolver.keypathObservers.push( keypathObserver );
	}

	else {
		// Couldn't resolve yet
		resolver.members[i] = undefined;

		unresolved = new Unresolved( ractive, ref, parentFragment, function ( keypath ) {
			removeFromArray( resolver.unresolved, unresolved );
			resolver.resolve( i, keypath );
		});

		resolver.unresolved.push( unresolved );
	}
}

function handleExpression ( resolver, member, i, parentFragment ) {
	var expressionResolver, resolved, wasUnresolved;

	expressionResolver = new ExpressionResolver( resolver, parentFragment, member, function ( keypath ) {
		if ( wasUnresolved ) {
			removeFromArray( resolver.unresolved, expressionResolver );
		}

		resolved = true;
		resolver.resolve( i, keypath );
	});

	if ( !resolved ) {
		wasUnresolved = true;
		resolver.unresolved.push( expressionResolver );
	}
}

function resolveBase ( resolver, ractive, ref, parentFragment ) {
	var keypath, unresolved;

	if ( keypath = resolveRef( ractive, ref, parentFragment ) ) {
		resolver.base = keypath;
	} else {
		unresolved = new Unresolved( ractive, ref, parentFragment, function ( keypath ) {
			resolver.base = keypath;
			removeFromArray( resolver.unresolved, unresolved );
			resolver.bubble();
		});

		resolver.unresolved.push( unresolved );
	}
};

var KeypathObserver = function ( ractive, keypath, priority, resolver, index ) {
	this.root = ractive;
	this.keypath = keypath;
	this.priority = priority;

	this.resolver = resolver;
	this.index = index;

	ractive.viewmodel.register( keypath, this );

	this.setValue( ractive.viewmodel.get( keypath ) );
};

KeypathObserver.prototype = {
	setValue: function ( value ) {
		var resolver = this.resolver;

		resolver.members[ this.index ] = value;
		resolver.bubble();
	},

	teardown: function () {
		this.root.viewmodel.unregister( this.keypath, this );
	}
};

export default ReferenceExpressionResolver;
