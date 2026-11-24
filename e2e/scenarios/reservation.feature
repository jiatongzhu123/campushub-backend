Feature: CampusHub resource reservations
  Students can book an available campus resource and receive a clear conflict when a time slot is taken.

  Scenario: Student reserves an available study room
    Given a student opens CampusHub with an available study room
    When they filter resources to Rooms
    And they select the study room and enter their demo user ID
    And they request tomorrow from 10:00 AM to 11:00 AM
    Then they see "Booking created. It now appears in My Bookings."
    And My Bookings shows their pending reservation for that room and time

  Scenario: Student receives a double-booking conflict for a 3D printer
    Given a 3D printer has an active reservation for tomorrow from 2:00 PM to 3:00 PM
    When another student selects that printer and requests the same time
    Then they see the message "This resource is already reserved for that time window. Choose different times and try again."
    And the second student's reservation is not created
