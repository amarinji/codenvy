/*
 *  [2015] - [2017] Codenvy, S.A.
 *  All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Codenvy S.A. and its suppliers,
 * if any.  The intellectual and technical concepts contained
 * herein are proprietary to Codenvy S.A.
 * and its suppliers and may be covered by U.S. and Foreign Patents,
 * patents in process, and are protected by trade secret or copyright law.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Codenvy S.A..
 */
'use strict';
import {CodenvyTeam} from '../../../../components/api/codenvy-team.factory';
import {CodenvyPermissions} from '../../../../components/api/codenvy-permissions.factory';
import {TeamDetailsService} from '../team-details.service';
import {CodenvyInvite} from '../../../../components/api/codenvy-invite.factory';

/**
 * @ngdoc controller
 * @name teams.members:ListTeamMembersController
 * @description This class is handling the controller for the list of team's members.
 * @author Ann Shumilova
 */
export class ListTeamMembersController {
  /**
   * Location service.
   */
  $location: ng.ILocationService;

  /**
   * Team API interaction.
   */
  private codenvyTeam: CodenvyTeam;
  /**
   * Invite API interaction.
   */
  private codenvyInvite: CodenvyInvite;
  /**
   * User API interaction.
   */
  private cheUser: any;
  /**
   * User profile API interaction.
   */
  private cheProfile: any;
  /**
   * Permissions API interaction.
   */
  private codenvyPermissions: CodenvyPermissions;
  /**
   * Service for displaying dialogs.
   */
  private $mdDialog: angular.material.IDialogService;
  /**
   * Notifications service.
   */
  private cheNotification: any;
  /**
   * Confirm dialog service.
   */
  private confirmDialogService: any;
  /**
   * Promises service.
   */
  private $q: ng.IQService;
  /**
   * Lodash library.
   */
  private lodash: any;
  /**
   * Team's members list.
   */
  private members: Array<any>;
  /**
   * Loading state of the page.
   */
  private isLoading: boolean;
  /**
   * Filter for members list.
   */
  private memberFilter: any;
  /**
   * Current team (comes from directive's scope).
   */
  private team: any;
  /**
   * Current team's owner (comes from directive's scope).
   */
  private owner: any;
  /**
   * The editable (whether current user can edit members list and see invitations) state of the members (comes from outside).
   */
  private editable: any;
  /**
   * Selection and filtration helper
   */
  cheListHelper: che.widget.ICheListHelper;

  /**
   * Default constructor that is using resource
   * @ngInject for Dependency injection
   */
  constructor(codenvyTeam: CodenvyTeam, codenvyPermissions: CodenvyPermissions, codenvyInvite: CodenvyInvite, cheUser: any, cheProfile: any,
              confirmDialogService: any, $mdDialog: angular.material.IDialogService, $q: ng.IQService, cheNotification: any,
              lodash: any, $location: ng.ILocationService, teamDetailsService: TeamDetailsService,
              $scope: ng.IScope, cheListHelperFactory: che.widget.ICheListHelperFactory) {
    this.codenvyTeam = codenvyTeam;
    this.codenvyInvite = codenvyInvite;
    this.codenvyPermissions = codenvyPermissions;
    this.cheProfile = cheProfile;
    this.cheUser = cheUser;
    this.$mdDialog = $mdDialog;
    this.$q = $q;
    this.$location = $location;
    this.lodash = lodash;
    this.cheNotification = cheNotification;
    this.confirmDialogService = confirmDialogService;

    this.members = [];
    this.isLoading = true;

    this.memberFilter = {name: ''};
    const helperId = 'list-team-members';
    this.cheListHelper = cheListHelperFactory.getHelper(helperId);
    $scope.$on('$destroy', () => {
      cheListHelperFactory.removeHelper(helperId);
    });

    this.owner = teamDetailsService.getOwner();
    this.team  = teamDetailsService.getTeam();

    this.refreshData(true, true);
  }

  /**
   * Callback when name is changed.
   *
   * @param str {string} a string to filter team members.
   */
  onSearchChanged(str: string): void {
    this.memberFilter.name = str;
    this.cheListHelper.applyFilter('name', this.memberFilter);
  }

  /**
   * Refreshes both list of members and invitations based on provided parameters.
   *
   * @param fetchMembers if <code>true</code> need to refresh members
   * @param fetchInvitations if <code>true</code> need to refresh invitations
   * @return {IPromise<any>}
   */
  refreshData(fetchMembers: boolean, fetchInvitations: boolean): ng.IPromise<any> {
    this.members = [];
    if (!this.team || !this.owner) {
      return;
    }

    const promises: Array<ng.IPromise<any>> = [];

    if (fetchMembers) {
      promises.push(this.fetchMembers());
    } else {
      this.formUserList();
    }

    // can fetch invites only admin or owner of the team:
    if (this.editable) {
      if (fetchInvitations) {
        promises.push(this.fetchInvitations());
      } else {
        this.formInvitationList();
      }
    }

    return this.$q.all(promises).finally(() => {
      const isMemberSelectable = (member: codenvy.IMember) => {
        return !this.memberIsOwner(member);
      };
      this.cheListHelper.setList(this.members, 'userId', isMemberSelectable);
    });
  }

  /**
   * Returns <code>true</code> if specified member is team owner.
   *
   * @param {codenvy.IMember> member a team member
   * @return {boolean}
   */
  memberIsOwner(member: codenvy.IMember): boolean {
    return member.userId === this.owner.id;
  }

  /**
   * Fetches the list of team members.
   *
   * @return {IPromise<any>}
   */
  fetchMembers(): ng.IPromise<any> {
    return this.codenvyPermissions.fetchOrganizationPermissions(this.team.id).then(() => {
      this.isLoading = false;
      return this.formUserList();
    }, (error: any) => {
      this.isLoading = false;
      if (error && error.status !== 304) {
        this.cheNotification.showError(error.data && error.data.message ? error.data.message : 'Failed to retrieve team permissions.');
        return this.$q.reject(error);
      } else {
        return this.formUserList();
      }
    });
  }

  /**
   * Combines permissions and users data in one list.
   *
   * @return {ng.IPromise<any>}
   */
  formUserList(): ng.IPromise<any> {
    let noOwnerPermissions = true;

    const promises: Array<ng.IPromise<any>> = [];

    const permissions = this.codenvyPermissions.getOrganizationPermissions(this.team.id);
    permissions.forEach((permission: any) => {
      const userId = permission.userId;
      const user = this.cheProfile.getProfileById(userId);

      if (userId === this.owner.id) {
        noOwnerPermissions = false;
      }

      if (user) {
        this.formUserItem(user, permission);
      } else {
        const promise = this.cheProfile.fetchProfileById(userId).then(() => {
          this.formUserItem(this.cheProfile.getProfileById(userId), permission);
        });
        promises.push(promise);
      }
    });

    if (noOwnerPermissions) {
      const user = this.cheProfile.getProfileById(this.owner.id);

      if (user) {
        this.formUserItem(user, null);
      } else {
        const promise = this.cheProfile.fetchProfileById(this.owner.id).then(() => {
          this.formUserItem(this.cheProfile.getProfileById(this.owner.id), null);
        });
        promises.push(promise);
      }
    }

    return this.$q.all(promises);
  }

  /**
   * Forms item to display with permissions and user data.
   *
   * @param user user data
   * @param permissions permissions data
   */
  formUserItem(user: any, permissions: any): void {
    user.name = this.cheProfile.getFullName(user.attributes);
    let userItem = angular.copy(user);
    userItem.permissions = permissions;
    this.members.push(userItem);
  }

  /**
   * Fetches the list of team's invitations.
   *
   * @return {IPromise<any>}
   */
  fetchInvitations(): ng.IPromise<any> {
    return this.codenvyInvite.fetchTeamInvitations(this.team.id).then((data: any) => {
      this.isLoading = false;
      this.formInvitationList();
    }, (error: any) => {
      this.isLoading = false;
      this.cheNotification.showError(error.data && error.data.message ? error.data.message : 'Failed to retrieve team invitations.');
    });
  }

  /**
   * Prepares invitations list to be displayed.
   */
  formInvitationList(): void {
    let invites = this.codenvyInvite.getTeamInvitations(this.team.id);

    invites.forEach((invite: any) => {
      let user = {userId: invite.email, name: 'Pending invitation', email: invite.email, permissions: invite, isPending: true};
      this.members.push(user);
    });
  }

  /**
   * Shows dialog for adding new member to the team.
   */
  showMemberDialog(member: any): void {
    this.$mdDialog.show({
      controller: 'MemberDialogController',
      controllerAs: 'memberDialogController',
      bindToController: true,
      clickOutsideToClose: true,
      locals: {
        members: this.members,
        callbackController: this,
        member: member
      },
      templateUrl: 'app/teams/member-dialog/member-dialog.html'
    });
  }

  /**
   * Add new members to the team.
   *
   * @param members members to be added
   * @param roles member roles
   */
  addMembers(members: Array<any>, roles: Array<any>): void {
    let promises = [];
    let unregistered = [];
    let isInvite = false;
    let isAddMember = false;

    members.forEach((member: any) => {
      let actions = this.codenvyTeam.getActionsFromRoles(roles);
      if (member.id) {
        isAddMember = true;
        let permissions = {
          instanceId: this.team.id,
          userId: member.id,
          domainId: 'organization',
          actions: actions
        };
        let promise = this.codenvyPermissions.storePermissions(permissions).catch((error: any) => {
          this.cheNotification.showError(error.data && error.data.message ? error.data.message : 'Add member to team failed.');
        });
        promises.push(promise);
      } else {
        isInvite = true;
        let promise = this.codenvyInvite.inviteToTeam(this.team.id, member.email, actions);
        promises.push(promise);
        unregistered.push(member.email);
      }
    });

    this.isLoading = true;
    this.$q.all(promises).then(() => {
      return this.refreshData(isAddMember, isInvite);
    }).finally(() => {
      this.isLoading = false;
      if (unregistered.length > 0) {
        this.cheNotification.showInfo('User' + (unregistered.length > 1 ? 's ' : ' ') + unregistered.join(', ')
          + (unregistered.length > 1 ? ' are' : ' is') + ' not registered in the system. The email invitations were sent.');
      }
    });
  }

  /**
   * Perform edit member permissions.
   *
   * @param member
   */
  editMember(member: any): void {
    this.showMemberDialog(member);
  }

  /**
   * Performs member's permissions update.
   *
   * @param member member to update permissions
   */
  updateMember(member: any): void {
    if (member.isPending) {
      if (member.permissions.actions.length > 0) {
        this.updateInvitation(member.permissions);
      } else {
        this.deleteInvitation(member);
      }
    } else {
      if (member.permissions.actions.length > 0) {
        this.storePermissions(member.permissions);
      } else {
        this.removePermissions(member);
      }
    }
  }

  /**
   * Stores provided permissions.
   *
   * @param permissions
   */
  storePermissions(permissions: any): void {
    this.isLoading = true;
    this.codenvyPermissions.storePermissions(permissions).then(() => {
      this.refreshData(true, false);
    }, (error: any) => {
      this.isLoading = false;
      this.cheNotification.showError(error.data && error.data.message ? error.data.message : 'Set user permissions failed.');
    });
  }

  /**
   * Updates the team's invitaion.
   *
   * @param member member's invitation to be updated
   */
  updateInvitation(member: any): void {
    this.codenvyInvite.inviteToTeam(this.team.id, member.email, member.actions);
  }

  /**
   * Deletes send invitation to the team.
   *
   * @param member member to delete invitation
   */
  deleteInvitation(member: any): void {
    this.isLoading = true;
    this.codenvyInvite.deleteTeamInvitation(this.team.id, member.email).then(() => {
      this.refreshData(false, true);
    }, (error: any) => {
      this.isLoading = false;
      this.cheNotification.showError(error.data && error.data.message ? error.data.message : 'Failed to remove invite send to ' + member.email + '.');
    });
  }

  /**
   * Remove all selected members.
   */
  removeSelectedMembers(): void {
    const selectedMembers = this.cheListHelper.getSelectedItems();

    if (!selectedMembers.length) {
      this.cheNotification.showError('No such members.');
      return;
    }

    const confirmationPromise = this.showDeleteMembersConfirmation(selectedMembers.length);
    confirmationPromise.then(() => {
      const removeMembersPromises = [];
      let removalError;
      let deleteInvite = false;
      let deleteMember = false;
      let deleteCurrentUser = false;

      selectedMembers.forEach((member: codenvy.IMember) => {
        this.cheListHelper.itemsSelectionStatus[member.userId] = false;
        if (member && member.isPending) {
          deleteInvite = true;
          const promise = this.codenvyInvite.deleteTeamInvitation(this.team.id, member.email);
          removeMembersPromises.push(promise);
          return;
        }

        deleteMember = true;
        if (member.userId === this.cheUser.getUser().id) {
          deleteCurrentUser = true;
        }

        const promise = this.codenvyPermissions.removeOrganizationPermissions(this.team.id, member.userId).catch((error: any) => {
            removalError = error;
        });
        removeMembersPromises.push(promise);
      });

      this.$q.all(removeMembersPromises).finally(() => {
        if (deleteCurrentUser) {
          this.processCurrentUserRemoval();
        } else {
          this.refreshData(deleteMember, deleteInvite);
        }

        if (removalError) {
          this.cheNotification.showError(removalError.data && removalError.data.message ? removalError.data.message : 'User removal failed.');
        }
      });
    });
  }

  /**
   * Finds member by it's id.
   *
   * @param id
   * @returns {any}
   */
  getMemberById(id: string): any {
    return this.lodash.find(this.members, (member: any) => {
      return member.userId === id;
    });
  }

  /**
   * Process the removal of current user from team.
   */
  processCurrentUserRemoval(): void {
    this.$location.path('/workspaces');
    this.codenvyTeam.fetchTeams();
  }

  /**
   * Removes user permissions for current team
   *
   * @param user user
   */
  removePermissions(user: any) {
    this.isLoading = true;
    this.codenvyPermissions.removeOrganizationPermissions(user.permissions.instanceId, user.userId).then(() => {
      if (user.userId === this.cheUser.getUser().id) {
        this.processCurrentUserRemoval();
      } else {
        this.refreshData(true, false);
      }
    }, (error: any) => {
      this.isLoading = false;
      this.cheNotification.showError(error.data && error.data.message ? error.data.message : 'Failed to remove user ' + user.email + ' permissions.');
    });
  }

  /**
   * Show confirmation popup before members removal
   * @param numberToDelete
   * @returns {*}
   */
  showDeleteMembersConfirmation(numberToDelete: number): any {
    let confirmTitle = 'Would you like to remove ';
    if (numberToDelete > 1) {
      confirmTitle += 'these ' + numberToDelete + ' members?';
    } else {
      confirmTitle += 'the selected member?';
    }

    return this.confirmDialogService.showConfirmDialog('Remove members', confirmTitle, 'Delete');
  }
}
